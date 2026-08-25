import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadAllOrdersForCustomer, loadAllInvoicesForCustomer } from '../firebase/firestore';
import BrandLogo from '../components/BrandLogo';
import emailjs from '@emailjs/browser';

/* ─── Types ─── */
interface Order {
  id: string; orderNo?: string; orderDate: string; orderTime: string;
  customerName: string; customerPhone: string; customerCode: string;
  projectName: string; projectLocation: string;
  orderType: 'concrete' | 'blocks'; quantity: number;
  concreteType: string; slump: string;
  status: 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes: string; salesRep: string;
  serverCreatedAt?: string; serverApprovedAt?: string; serverUpdatedAt?: string;
}

interface Invoice {
  id: string; orderNo?: string; invoiceNo?: string; date: string;
  customerName: string; customerPhone: string;
  items: { desc: string; qty: number; unit: number; total: number }[];
  total: number; tax: number; grandTotal: number;
  status: 'unpaid' | 'partial' | 'paid';
  paidAmount?: number;
}

/* ─── Helpers ─── */
const STATUS_MAP: Record<string, { ar: string; color: string; icon: string }> = {
  pending:     { ar: 'بانتظار الموافقة', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: '⏳' },
  approved:    { ar: 'تمت الموافقة',    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',    icon: '✅' },
  scheduled:   { ar: 'تم الجدولة',      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30', icon: '📅' },
  in_progress: { ar: 'قيد التنفيذ',     color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', icon: '🚚' },
  completed:   { ar: 'تم التسليم',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: '🎉' },
  cancelled:   { ar: 'ملغي',            color: 'text-red-400 bg-red-500/10 border-red-500/30',       icon: '❌' },
};

const INV_STATUS: Record<string, { ar: string; color: string }> = {
  unpaid:  { ar: 'غير مدفوعة',   color: 'text-red-400 bg-red-500/10' },
  partial: { ar: 'دفعة جزئية',   color: 'text-yellow-400 bg-yellow-500/10' },
  paid:    { ar: 'مدفوعة بالكامل', color: 'text-emerald-400 bg-emerald-500/10' },
};

function generateOTP(): string { return String(Math.floor(100000 + Math.random() * 900000)); }

const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-xl p-3.5 text-slate-100 text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_16px_rgba(56,189,248,0.2)] transition placeholder:text-slate-500";

/* ─── Main Component ─── */
export default function CustomerPortal() {
  const navigate = useNavigate();

  /* ── Auth state ── */
  const [phase, setPhase] = useState<'login' | 'otp' | 'dashboard'>('login');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /* ── Data ── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTab, setActiveTab] = useState<'orders' | 'invoices'>('orders');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  /* ── Search ── */
  const [searchQuery, setSearchQuery] = useState('');

  /* ─── Login Handler ─── */
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('أدخل رقم الموبايل أو رقم الفاتورة'); return; }
    setBusy(true);

    // Generate OTP and send via EmailJS
    const code = generateOTP();
    setGeneratedOtp(code);
    setOtpSentTo(identifier);
    setPhase('otp');
    setBusy(false);

    // Send OTP via EmailJS (configured in .env)
    try {
      await emailjs.send(
        import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_mdtxmv8',
        import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_ablqhm3',
        {
          to_email: identifier,
          to_name: 'عميل Fimto',
          subject: `🔐 رمز التحقق: ${code}`,
          message: `مرحباً،\n\nرمز التحقق الخاص بك: ${code}\n\nهذا الرمز صالح لمدة 5 دقائق فقط.\n\nإذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.\n\nمع خالص التحيات،\nفريق Fimto Soft`,
        },
        { publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'UPIUNYeckrEK-z_xz' }
      );
      console.log('[OTP] Sent via EmailJS to', identifier);
    } catch (err) {
      console.warn('[OTP] EmailJS failed, showing in console:', err);
      // Fallback: show in console if email fails
      alert(`⚠️ فشل إرسال الإيميل. رمز التحقق: ${code}`);
    }
  };

  /* ─── OTP Handler ─── */
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp !== generatedOtp) { setError('الرمز غير صحيح'); return; }
    setBusy(true);

    try {
      // Search orders by phone or invoice number
      const [foundOrders, foundInvoices] = await Promise.all([
        loadAllOrdersForCustomer(identifier.trim()),
        loadAllInvoicesForCustomer(identifier.trim()),
      ]);
      setOrders(foundOrders);
      setInvoices(foundInvoices);
      setPhase('dashboard');
    } catch {
      setError('حدث خطأ أثناء تحميل البيانات');
    }
    setBusy(false);
  };

  /* ─── Filtered Data ─── */
  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o =>
      o.orderNo?.toLowerCase().includes(q) ||
      o.projectName.toLowerCase().includes(q) ||
      o.concreteType.includes(q)
    );
  }, [orders, searchQuery]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return invoices;
    const q = searchQuery.toLowerCase();
    return invoices.filter(i =>
      i.invoiceNo?.toLowerCase().includes(q) ||
      i.orderNo?.toLowerCase().includes(q)
    );
  }, [invoices, searchQuery]);

  /* ─── Stats ─── */
  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter(o => ['approved', 'scheduled', 'in_progress'].includes(o.status)).length,
    completed: orders.filter(o => o.status === 'completed').length,
    totalValue: invoices.reduce((s, i) => s + i.grandTotal, 0),
    unpaid: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.grandTotal - (i.paidAmount || 0), 0),
  }), [orders, invoices]);

  /* ─── Render: Login ─── */
  if (phase === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56,189,248,0.12), transparent), #080C14" }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4"><BrandLogo width={160} rounded="rounded-2xl" /></div>
            <h1 className="text-2xl font-black text-white mb-2">متابعة الطلبات والفواتير</h1>
            <p className="text-sm text-slate-400">أدخل رقم الموبايل أو رقم الفاتورة للدخول</p>
          </div>

          <form onSubmit={handleLogin} className="bg-[#0B111E]/80 border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-2 block">رقم الموبايل أو الفاتورة</label>
              <input
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="01001006627 أو INV-001"
                className={inputCls}
                dir="ltr"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
              {busy ? '⏳ جاري الإرسال...' : '📱 إرسال رمز التحقق'}
            </button>
            <button type="button" onClick={() => navigate('/')}
              className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 font-bold py-3 rounded-xl transition text-sm">
              ← العودة للموقع
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ─── Render: OTP ─── */
  if (phase === 'otp') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(56,189,248,0.12), transparent), #080C14" }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4"><BrandLogo width={160} rounded="rounded-2xl" /></div>
            <h1 className="text-2xl font-black text-white mb-2">التحقق من الهوية</h1>
            <p className="text-sm text-slate-400">أدخل الرمز المُرسل إلى <strong className="text-sky-300">{otpSentTo}</strong></p>
          </div>

          <form onSubmit={handleVerifyOtp} className="bg-[#0B111E]/80 border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs text-slate-400 font-semibold mb-2 block">رمز التحقق (6 أرقام)</label>
              <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="000000"
                className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`} maxLength={6} dir="ltr" />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">
              {busy ? '⏳ جاري التحقق...' : '✅ تحقق ودخول'}
            </button>
            <button type="button" onClick={() => { setPhase('login'); setError(''); setOtp(''); }}
              className="w-full text-slate-400 text-sm underline mt-2">← تعديل الرقم</button>
          </form>
        </div>
      </div>
    );
  }

  /* ─── Render: Dashboard ─── */
  return (
    <div className="min-h-screen" style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.1), transparent), #080C14" }}>
      {/* Header */}
      <header className="bg-[#0B111E]/80 backdrop-blur-xl px-4 sm:px-6 py-3 sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo width={40} rounded="rounded-xl" />
            <div>
              <h1 className="text-sm font-black text-white">لوحة متابعة العميل</h1>
              <p className="text-[10px] text-sky-400">{identifier}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setPhase('login'); setOrders([]); setInvoices([]); setIdentifier(''); setOtp(''); }}
              className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">
              خروج ↩
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الطلبات', value: stats.total, icon: '📦', color: 'text-white' },
            { label: 'طلبات نشطة', value: stats.active, icon: '🚚', color: 'text-sky-400' },
            { label: 'تم التسليم', value: stats.completed, icon: '✅', color: 'text-emerald-400' },
            { label: 'المبلغ غير المدفوع', value: `${stats.unpaid.toLocaleString('ar-EG')} ر.س`, icon: '💰', color: 'text-yellow-400' },
          ].map((s, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4 text-center">
              <span className="text-2xl">{s.icon}</span>
              <p className={`text-lg font-black mt-1 ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex bg-white/[0.03] border border-white/10 rounded-xl p-1">
            <button onClick={() => setActiveTab('orders')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'orders' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-white'}`}>
              📦 الطلبات ({orders.length})
            </button>
            <button onClick={() => setActiveTab('invoices')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'invoices' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-white'}`}>
              🧾 الفواتير ({invoices.length})
            </button>
          </div>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 بحث بالرقم أو المشروع..."
            className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:border-sky-400/50 w-full sm:w-64 placeholder:text-slate-500" />
        </div>

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {filteredOrders.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-4xl mb-3">📦</p>
                <p className="font-bold">لا توجد طلبات</p>
              </div>
            )}
            {filteredOrders.map(order => {
              const st = STATUS_MAP[order.status] || STATUS_MAP.pending;
              const isExpanded = expandedOrder === order.id;
              return (
                <div key={order.id}
                  className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-sky-400/50' : 'border-white/10 hover:border-white/20'}`}>
                  <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full p-4 text-right flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0">{st.icon}</span>
                      <div className="min-w-0 text-right">
                        <p className="text-sm font-bold text-white truncate">{order.orderNo || order.id}</p>
                        <p className="text-[11px] text-slate-400 truncate">{order.projectName} — {order.concreteType}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${st.color}`}>{st.ar}</span>
                      <span className="text-slate-500 text-xs">{order.orderDate}</span>
                      <svg className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-white/10 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-slate-500">الكمية:</span> <strong className="text-slate-200">{order.quantity} م³</strong></div>
                      <div><span className="text-slate-500">نوع الخرسانة:</span> <strong className="text-slate-200">{order.concreteType}</strong></div>
                      <div><span className="text-slate-500">السحلب:</span> <strong className="text-slate-200">{order.slump}</strong></div>
                      <div><span className="text-slate-500">الموقع:</span> <strong className="text-slate-200">{order.projectLocation}</strong></div>
                      <div><span className="text-slate-500">المندوب:</span> <strong className="text-slate-200">{order.salesRep}</strong></div>
                      <div><span className="text-slate-500">التاريخ:</span> <strong className="text-slate-200">{order.orderDate} {order.orderTime}</strong></div>
                      {order.notes && <div className="col-span-full"><span className="text-slate-500">ملاحظات:</span> <strong className="text-slate-200">{order.notes}</strong></div>}
                      <div className="col-span-full pt-2 border-t border-white/10">
                        <div className="flex items-center gap-2">
                          {['pending', 'approved', 'scheduled', 'in_progress', 'completed'].map((s, i) => {
                            const isActive = ['pending', 'approved', 'scheduled', 'in_progress', 'completed'].indexOf(order.status) >= i;
                            return <div key={s} className={`flex-1 h-1.5 rounded-full ${isActive ? 'bg-sky-400' : 'bg-white/10'}`} />;
                          })}
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                          <span>بانتظار</span><span>موافقة</span><span>جدولة</span><span>تنفيذ</span><span>تسليم</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            {filteredInvoices.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <p className="text-4xl mb-3">🧾</p>
                <p className="font-bold">لا توجد فواتير</p>
              </div>
            )}
            {filteredInvoices.map(inv => {
              const ist = INV_STATUS[inv.status] || INV_STATUS.unpaid;
              return (
                <div key={inv.id}
                  className="bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-white/20 transition">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold text-white">{inv.invoiceNo || inv.id}</p>
                      <p className="text-[11px] text-slate-400">{inv.date}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${ist.color}`}>{ist.ar}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mt-3 pt-3 border-t border-white/10">
                    <div><span className="text-slate-500">الإجمالي:</span> <strong className="text-white">{inv.grandTotal.toLocaleString('ar-EG')} ر.س</strong></div>
                    <div><span className="text-slate-500">المدفوع:</span> <strong className="text-emerald-400">{(inv.paidAmount || 0).toLocaleString('ar-EG')} ر.س</strong></div>
                    <div><span className="text-slate-500">المتبقي:</span> <strong className="text-yellow-400">{(inv.grandTotal - (inv.paidAmount || 0)).toLocaleString('ar-EG')} ر.س</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
