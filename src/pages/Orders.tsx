import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadOrders, saveOrders } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import DatePicker from '../components/DatePicker';
import EInvoice from '../components/EInvoice';
import CustomersManager, { type Customer } from '../components/CustomersManager';
import NotificationsBell from '../components/NotificationsBell';
import { addNotification } from '../firebase/firestore';

interface Order {
  id: string;
  orderNo?: string;
  customerId?: string;
  orderDate: string;
  orderTime: string;
  customerName: string;
  customerPhone: string;
  customerCode: string; // كود العميل من المحاسب
  projectName: string;
  projectLocation: string;
  locationCoords: string;
  orderType: 'concrete' | 'blocks';
  elementType: string; // نوع العنصر (قواعد، أعمدة، سقف، إلخ)
  quantity: number;
  concreteType: string; // 2000, 2500, 3000, 3500, 4000, 5000
  slump: string;
  cementType: 'ordinary' | 'resistant'; // عادي أو مقاوم
  siteReady: boolean; // جاهزية الموقع
  pumpAccessible: boolean; // إمكانية وصول المضخة
  requiresPump: boolean; // طالب تلج
  requiresLab: boolean; // وجود معمل
  salesRep: string; // اسم المندوب
  accountant: string; // اسم المحاسب
  accountStatus: 'approved' | 'pending' | 'rejected' | 'postponed'; // موافق / مرفوض / مؤجل
  accountantDecision: 'execute' | 'postpone' | 'cancel'; // تنفيذ / تأجيل / إلغاء
  debtStatus: 'clear' | 'has_debt' | 'blocked';
  notes: string;
  status: 'pending' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  dailyEvaluation?: {
    plantScore: number;
    truckScore: number;
    laborScore: number;
    totalScore: number;
    notes: string;
  };
}

const ORDERS_KEY = 'concrete_plant_orders';

export default function Orders() {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'completed'>('all');
  const [invoiceFor, setInvoiceFor] = useState<Order | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  useEffect(() => {
    if (!currentUser) return;
    import('../firebase/firestore').then(({ loadCustomers }) => loadCustomers(currentUser.username)).then(d => {
      if (Array.isArray(d) && d.length) setCustomers(d);
      else { const s = localStorage.getItem('concrete_plant_customers'); if (s) setCustomers(JSON.parse(s)); }
    }).catch(() => {});
  }, [currentUser?.username]);

  const [form, setForm] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    orderTime: '08:00',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerCode: '',
    projectName: '',
    projectLocation: '',
    locationCoords: '',
    orderType: 'concrete' as 'concrete' | 'blocks',
    elementType: 'foundation',
    quantity: '',
    concreteType: '3000',
    slump: '12',
    cementType: 'ordinary' as 'ordinary' | 'resistant',
    siteReady: true,
    pumpAccessible: true,
    requiresPump: false,
    requiresLab: false,
    salesRep: '',
    accountant: '',
    accountStatus: 'pending' as 'approved' | 'pending' | 'rejected' | 'postponed',
    accountantDecision: 'execute' as 'execute' | 'postpone' | 'cancel',
    debtStatus: 'clear' as 'clear' | 'has_debt' | 'blocked',
    notes: '',
  });

  // Load orders from localStorage + Firestore
  useEffect(() => {
    if (!currentUser) return;
    loadOrders(currentUser.username)
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) setOrders(data);
        else {
          const saved = localStorage.getItem(ORDERS_KEY);
          if (saved) setOrders(JSON.parse(saved));
        }
      })
      .catch(() => {
        const saved = localStorage.getItem(ORDERS_KEY);
        if (saved) setOrders(JSON.parse(saved));
      });
  }, [currentUser?.username]);

  // Save orders to localStorage + Firestore
  useEffect(() => {
    if (!currentUser) return;
    if (orders.length > 0 || localStorage.getItem(ORDERS_KEY)) {
      localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }
    if (orders.length > 0) saveOrders(currentUser.username, orders).catch(() => {});
  }, [orders, currentUser?.username]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.customerName || !form.customerPhone || !form.projectName || !form.quantity) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    let orderNo = editingOrder?.orderNo;
    if (!orderNo) {
      const maxNum = orders.reduce((m, o) => Math.max(m, (parseInt(String(o.orderNo || '').replace('ORD-', ''), 10) || 0)), 0);
      orderNo = 'ORD-' + String(maxNum + 1).padStart(4, '0');
    }

    const newOrder: Order = {
      id: editingOrder?.id || Date.now().toString(),
      orderNo,
      customerId: form.customerId || editingOrder?.customerId,
      orderDate: form.orderDate,
      orderTime: form.orderTime,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      projectName: form.projectName,
      projectLocation: form.projectLocation,
      locationCoords: form.locationCoords,
      orderType: form.orderType,
      elementType: form.elementType,
      quantity: parseFloat(form.quantity),
      concreteType: form.concreteType,
      cementType: form.cementType,
      slump: form.slump,
      siteReady: form.siteReady,
      pumpAccessible: form.pumpAccessible,
      requiresPump: form.requiresPump,
      requiresLab: form.requiresLab,
      salesRep: form.salesRep,
      accountant: form.accountant,
      customerCode: form.customerCode,
      accountantDecision: form.accountantDecision,
      accountStatus: form.accountStatus,
      debtStatus: form.debtStatus,
      notes: form.notes,
      status: 'pending',
    };

    if (editingOrder) {
      setOrders(prev => prev.map(o => o.id === editingOrder.id ? newOrder : o));
      setEditingOrder(null);
      if (currentUser) addNotification(currentUser.username, { level: 'info', title: '✏️ تم تعديل الطلب ' + orderNo, body: `${form.customerName} · ${form.projectName}` }).catch(() => {});
    } else {
      setOrders(prev => [...prev, newOrder]);
      if (currentUser) addNotification(currentUser.username, { level: 'info', title: '📦 طلب جديد ' + orderNo, body: `${form.customerName} · ${form.quantity} ${form.orderType === 'concrete' ? 'م³' : 'بلوك'} · بانتظار مراجعة الحسابات` }).catch(() => {});
    }

    resetForm();
    setShowForm(false);
  };

  const resetForm = () => {
    setForm({
      orderDate: new Date().toISOString().split('T')[0],
      orderTime: '08:00',
      customerId: '',
      customerName: '',
      customerPhone: '',
      customerCode: '',
      projectName: '',
      projectLocation: '',
      locationCoords: '',
      orderType: 'concrete',
      elementType: 'foundation',
      quantity: '',
      concreteType: '3000',
      slump: '12',
      cementType: 'ordinary',
      siteReady: true,
      pumpAccessible: true,
      requiresPump: false,
      requiresLab: false,
      salesRep: '',
      accountant: '',
      accountStatus: 'pending',
      accountantDecision: 'execute',
      debtStatus: 'clear',
      notes: '',
    });
  };

  const handleEdit = (order: Order) => {
    setEditingOrder(order);
    setForm({
      orderDate: order.orderDate,
      orderTime: order.orderTime,
      customerId: order.customerId || '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerCode: order.customerCode || '',
      projectName: order.projectName,
      projectLocation: order.projectLocation,
      locationCoords: order.locationCoords,
      orderType: order.orderType,
      elementType: order.elementType || 'foundation',
      quantity: order.quantity.toString(),
      concreteType: order.concreteType || '3000',
      slump: order.slump || '12',
      cementType: order.cementType || 'ordinary',
      siteReady: order.siteReady !== false,
      pumpAccessible: order.pumpAccessible !== false,
      requiresPump: order.requiresPump === true,
      requiresLab: order.requiresLab === true,
      salesRep: order.salesRep || '',
      accountant: order.accountant || '',
      accountStatus: order.accountStatus,
      accountantDecision: order.accountantDecision || 'execute',
      debtStatus: order.debtStatus,
      notes: order.notes,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الطلب؟')) {
      setOrders(prev => prev.filter(o => o.id !== id));
    }
  };

  const handleApproveAccount = (id: string, status: 'approved' | 'rejected') => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (currentUser) addNotification(currentUser.username, {
        level: status === 'approved' ? 'success' : 'error',
        title: `${status === 'approved' ? '✅ موافقة الحسابات' : '❌ رفض الحسابات'} ${o.orderNo || id}`,
        body: `${o.customerName} · ${o.projectName}`,
      }).catch(() => {});
      return { ...o, accountStatus: status };
    }));
  };

  const handleMarkScheduled = (id: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (currentUser) addNotification(currentUser.username, {
        level: 'info', title: '📅 تمت جدولة ' + (o.orderNo || id),
        body: `${o.customerName} · ${o.quantity} ${o.orderType === 'concrete' ? 'م³' : 'بلوك'} — جاهز للتشغيل`,
      }).catch(() => {});
      return { ...o, status: 'scheduled' };
    }));
  };

  const handleMarkCompleted = (id: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o;
      if (currentUser) addNotification(currentUser.username, {
        level: 'success', title: '✅ اكتمل الطلب ' + (o.orderNo || id),
        body: `${o.customerName} · ${o.projectName}`,
      }).catch(() => {});
      return { ...o, status: 'completed' };
    }));
  };

  const filteredOrders = orders.filter(o => {
    if (filter === 'all') return true;
    return o.status === filter;
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    scheduled: orders.filter(o => o.status === 'scheduled').length,
    completed: orders.filter(o => o.status === 'completed').length,
    accountPending: orders.filter(o => o.accountStatus === 'pending').length,
    hasDebt: orders.filter(o => o.debtStatus === 'has_debt').length,
    blocked: orders.filter(o => o.debtStatus === 'blocked').length,
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 Access Denied</p>
          <Link to="/" className="text-blue-400 underline">Back to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump />
          <LangSelector />
          <h1 className="text-sm font-bold text-white">📦 نظام الطلبات</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotificationsBell />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <div className="bg-[#1e293b] border border-[#334155] rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">إجمالي الطلبات</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-[#1e293b] border border-yellow-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">قيد الانتظار</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="bg-[#1e293b] border border-blue-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">مجدول</p>
            <p className="text-2xl font-bold text-blue-400">{stats.scheduled}</p>
          </div>
          <div className="bg-[#1e293b] border border-emerald-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">مكتمل</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.completed}</p>
          </div>
          <div className="bg-[#1e293b] border border-orange-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">بانتظار الحسابات</p>
            <p className="text-2xl font-bold text-orange-400">{stats.accountPending}</p>
          </div>
          <div className="bg-[#1e293b] border border-purple-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">عليه ديون</p>
            <p className="text-2xl font-bold text-purple-400">{stats.hasDebt}</p>
          </div>
          <div className="bg-[#1e293b] border border-red-500/30 rounded-lg p-4">
            <p className="text-xs text-slate-400 mb-1">محظور</p>
            <p className="text-2xl font-bold text-red-400">{stats.blocked}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setShowCustomers(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
            >
              👥 إدارة العملاء
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
            >
              ➕ إضافة طلب جديد
            </button>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-[#1e293b] border border-[#334155] text-white px-4 py-2 rounded-lg text-sm"
            >
              <option value="all">جميع الطلبات</option>
              <option value="pending">قيد الانتظار</option>
              <option value="scheduled">مجدول</option>
              <option value="completed">مكتمل</option>
            </select>
          </div>
          <Link
            to="/schedule"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
          >
            📅 الذهاب إلى الجدول
          </Link>
        </div>

        {/* Order Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-[#1e293b] rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingOrder ? '✏️ تعديل الطلب' : '➕ طلب جديد'}
              </h2>

              {editingOrder?.orderNo && (
                <p className="text-xs font-bold text-blue-400 mb-3">🆔 رقم الطلب: <span className="text-white">{editingOrder.orderNo}</span></p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* التاريخ والوقت */}
                <div className="grid grid-cols-2 gap-4">
                  <DatePicker
                    value={form.orderDate}
                    onChange={(val) => setForm(prev => ({ ...prev, orderDate: val }))}
                    label="📅 تاريخ الطلب"
                    required
                  />
                  <div>
                    <label className="text-xs text-slate-400 font-semibold mb-1 block">🕐 وقت الطلب</label>
                    <input
                      type="time"
                      name="orderTime"
                      value={form.orderTime}
                      onChange={handleInputChange}
                      className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      required
                    />
                  </div>
                </div>

                {/* بيانات العميل */}
                <div className="bg-[#0f172a] p-4 rounded-lg border border-[#334155]">
                  <h3 className="text-sm font-bold text-blue-400 mb-3">👤 بيانات العميل</h3>
                  <div className="grid grid-cols-1 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">العميل (من قاعدة العملاء) — اختياري، يملأ الاسم والهاتف تلقائياً</label>
                      <select
                        name="customerId"
                        value={form.customerId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setForm(prev => ({ ...prev, customerId: id }));
                          if (id) {
                            const c = [...customers].find(x => x.id === id);
                            if (c) setForm(prev => ({ ...prev, customerName: c.name, customerPhone: c.phone, customerCode: c.code }));
                          }
                        }}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      >
                        <option value="">— بدون اختيار (أدخل يدوياً) —</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">اسم العميل *</label>
                      <input
                        type="text"
                        name="customerName"
                        value={form.customerName}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">رقم الهاتف *</label>
                      <input
                        type="tel"
                        name="customerPhone"
                        value={form.customerPhone}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* بيانات المشروع */}
                <div className="bg-[#0f172a] p-4 rounded-lg border border-[#334155]">
                  <h3 className="text-sm font-bold text-blue-400 mb-3">🏗️ بيانات المشروع</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">اسم المشروع *</label>
                      <input
                        type="text"
                        name="projectName"
                        value={form.projectName}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">عنوان المشروع</label>
                      <input
                        type="text"
                        name="projectLocation"
                        value={form.projectLocation}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">إحداثيات الموقع (lat, lng)</label>
                      <input
                        type="text"
                        name="locationCoords"
                        value={form.locationCoords}
                        onChange={handleInputChange}
                        placeholder="26.4207, 50.0888"
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* تفاصيل الطلب */}
                <div className="bg-[#0f172a] p-4 rounded-lg border border-[#334155]">
                  <h3 className="text-sm font-bold text-blue-400 mb-3">📦 تفاصيل الطلب</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">نوع الطلب *</label>
                      <select
                        name="orderType"
                        value={form.orderType}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      >
                        <option value="concrete">🏗️ خرسانة</option>
                        <option value="blocks">🧱 بلوك</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">نوع العنصر *</label>
                      <select
                        name="elementType"
                        value={form.elementType}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      >
                        <option value="foundation">🏗️ قواعد/أساسات</option>
                        <option value="columns">🏛️ أعمدة</option>
                        <option value="beams">📏 كمرات</option>
                        <option value="slab">🏠 سقف/بلاطة</option>
                        <option value="walls">🧱 حوائط</option>
                        <option value="stairs">🪜 سلالم</option>
                        <option value="cleaning_layer">🧹 فرشة نظافة</option>
                        <option value="other">📦 أخرى</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">الكمية *</label>
                      <input
                        type="number"
                        name="quantity"
                        value={form.quantity}
                        onChange={handleInputChange}
                        step="0.5"
                        min="0"
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {form.orderType === 'concrete' ? 'المتر المكعب' : 'عدد البلوك'}
                      </p>
                    </div>

                    {form.orderType === 'concrete' && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">قوة الخرسانة *</label>
                            <select
                              name="concreteType"
                              value={form.concreteType}
                              onChange={handleInputChange}
                              className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                              required
                            >
                              <option value="2000">2000 (عادية)</option>
                              <option value="2500">2500</option>
                              <option value="3000">3000</option>
                              <option value="3500">3500</option>
                              <option value="4000">4000</option>
                              <option value="5000">5000 (عالية القوة)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Slump (cm)</label>
                            <input
                              type="number"
                              name="slump"
                              value={form.slump}
                              onChange={handleInputChange}
                              min="5"
                              max="20"
                              className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">نوع الأسمنت *</label>
                          <select
                            name="cementType"
                            value={form.cementType}
                            onChange={handleInputChange}
                            className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                            required
                          >
                            <option value="ordinary">🏭 عادي (OPC)</option>
                            <option value="resistant">🛡️ مقاوم للكبريتات (SRC)</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* جاهزية الموقع */}
                    <div className="border-t border-[#334155] pt-3 mt-3">
                      <label className="text-xs text-blue-400 font-bold mb-2 block">🏗️ جاهزية الموقع</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-[#334155] p-2 rounded">
                          <input
                            type="checkbox"
                            name="siteReady"
                            checked={form.siteReady}
                            onChange={e => setForm({ ...form, siteReady: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>✓ الموقع جاهز للصب</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-[#334155] p-2 rounded">
                          <input
                            type="checkbox"
                            name="pumpAccessible"
                            checked={form.pumpAccessible}
                            onChange={e => setForm({ ...form, pumpAccessible: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>✓ يمكن للمضخة الوصول</span>
                        </label>
                      </div>
                    </div>

                    {/* المتطلبات */}
                    <div className="border-t border-[#334155] pt-3 mt-3">
                      <label className="text-xs text-blue-400 font-bold mb-2 block">📋 المتطلبات</label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-[#334155] p-2 rounded">
                          <input
                            type="checkbox"
                            name="requiresPump"
                            checked={form.requiresPump}
                            onChange={e => setForm({ ...form, requiresPump: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>🚰 طالب تلج (مضخة)</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer bg-[#334155] p-2 rounded">
                          <input
                            type="checkbox"
                            name="requiresLab"
                            checked={form.requiresLab}
                            onChange={e => setForm({ ...form, requiresLab: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span>🧪 يحتاج معمل (اختبارات)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* المندوب والمحاسب */}
                <div className="bg-[#0f172a] p-4 rounded-lg border border-purple-500/30">
                  <h3 className="text-sm font-bold text-purple-400 mb-3">👥 المندوب والمحاسب</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">📱 اسم المندوب *</label>
                      <input
                        type="text"
                        name="salesRep"
                        value={form.salesRep}
                        onChange={handleInputChange}
                        placeholder="اسم مندوب المبيعات"
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">💼 اسم المحاسب *</label>
                      <input
                        type="text"
                        name="accountant"
                        value={form.accountant}
                        onChange={handleInputChange}
                        placeholder="اسم المحاسب المسئول"
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 mb-1 block">🔢 كود العميل (يحدده المحاسب)</label>
                    <input
                      type="text"
                      name="customerCode"
                      value={form.customerCode}
                      onChange={handleInputChange}
                      placeholder="سيتم إنشاؤه بعد الموافقة"
                      className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                    />
                  </div>
                </div>

                {/* قرار المحاسب */}
                <div className="bg-[#0f172a] p-4 rounded-lg border border-orange-500/30">
                  <h3 className="text-sm font-bold text-orange-400 mb-3">💰 قرار المحاسب</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">قرار المحاسب *</label>
                      <select
                        name="accountantDecision"
                        value={form.accountantDecision}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                        required
                      >
                        <option value="execute">✅ تنفيذ</option>
                        <option value="postpone">⏸️ تأجيل</option>
                        <option value="cancel">❌ إلغاء</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">حالة الحسابات</label>
                      <select
                        name="accountStatus"
                        value={form.accountStatus}
                        onChange={handleInputChange}
                        className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                      >
                        <option value="pending">⏳ بانتظار المراجعة</option>
                        <option value="approved">✅ موافق عليه</option>
                        <option value="rejected">❌ مرفوض</option>
                        <option value="postponed">⏸️ مؤجل</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs text-slate-400 mb-1 block">⚠️ حالة الديون</label>
                    <select
                      name="debtStatus"
                      value={form.debtStatus}
                      onChange={handleInputChange}
                      className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                    >
                      <option value="clear">✅ لا يوجد ديون</option>
                      <option value="has_debt">⚠️ عليه ديون</option>
                      <option value="blocked">🚫 محظور (ديون كبيرة)</option>
                    </select>
                  </div>
                </div>

                {/* ملاحظات */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">ملاحظات إضافية</label>
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"
                  />
                </div>

                {/* أزرار */}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg"
                  >
                    💾 {editingOrder ? 'تحديث' : 'حفظ'} الطلب
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingOrder(null); resetForm(); }}
                    className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-bold py-2 rounded-lg"
                  >
                    ❌ إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Orders List */}
        <div className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f172a] border-b border-[#334155]">
                <tr>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">التاريخ/الوقت</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">رقم الطلب</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">العميل</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">المشروع</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">النوع</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">الكمية</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">الحسابات</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">الديون</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">الحالة</th>
                  <th className="text-right p-3 text-xs font-semibold text-slate-400">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-500">
                      لا توجد طلبات
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="border-b border-[#334155] hover:bg-[#0f172a]/50">
                      <td className="p-3 text-sm">
                        <div className="text-white">{order.orderDate}</div>
                        <div className="text-xs text-slate-400">{order.orderTime}</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="text-white font-bold text-blue-400">{order.orderNo || '—'}</div>
                        <div className="text-xs text-slate-400">{order.customerCode || '—'}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-white text-sm">{order.customerName}</div>
                        <div className="text-xs text-slate-400">{order.customerPhone}</div>
                      </td>
                      <td className="p-3 text-sm text-white">{order.projectName}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.orderType === 'concrete'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {order.orderType === 'concrete' ? '🏗️ خرسانة' : '🧱 بلوك'}
                        </span>
                        {order.concreteType && (
                          <div className="text-xs text-slate-400 mt-1">{order.concreteType}</div>
                        )}
                      </td>
                      <td className="p-3 text-white text-sm">
                        {order.quantity}
                        <div className="text-xs text-slate-400">
                          {order.orderType === 'concrete' ? 'م³' : 'بلوك'}
                        </div>
                      </td>
                      <td className="p-3">
                        <select
                          value={order.accountStatus}
                          onChange={(e) => handleApproveAccount(order.id, e.target.value as any)}
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            order.accountStatus === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : order.accountStatus === 'rejected'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-orange-500/20 text-orange-400'
                          }`}
                        >
                          <option value="pending">⏳ بانتظار</option>
                          <option value="approved">✅ موافق</option>
                          <option value="rejected">❌ مرفوض</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.debtStatus === 'clear'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : order.debtStatus === 'has_debt'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {order.debtStatus === 'clear' ? '✅' : order.debtStatus === 'has_debt' ? '⚠️' : '🚫'}
                          {order.debtStatus === 'clear' ? 'واضح' : order.debtStatus === 'has_debt' ? 'ديون' : 'محظور'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          order.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : order.status === 'scheduled'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {order.status === 'pending' ? '⏳ انتظار' : order.status === 'scheduled' ? '📅 مجدول' : '✅ مكتمل'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {order.status === 'pending' && order.accountStatus === 'approved' && order.debtStatus !== 'blocked' && (
                            <button
                              onClick={() => handleMarkScheduled(order.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                            >
                              📅 جدولة
                            </button>
                          )}
                          {order.status === 'scheduled' && (
                            <button
                              onClick={() => handleMarkCompleted(order.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs"
                            >
                              ✅ تم
                            </button>
                          )}
                          {order.status === 'completed' && (
                            <button
                              onClick={() => setInvoiceFor(order)}
                              className="bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded text-xs"
                            >
                              🧾 فاتورة
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(order)}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded text-xs"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <h3 className="text-sm font-bold text-blue-400 mb-2">💡 كيفية الاستخدام</h3>
          <ul className="text-xs text-slate-300 space-y-1">
            <li>✅ أضف الطلبات مع تحديد تاريخ ووقت الطلب</li>
            <li>✅ اوافق على الحسابات بعد التحقق من حالة العميل</li>
            <li>✅ إذا كان العميل محظور (ديون كبيرة) لن يتم جدولة الطلب</li>
            <li>✅ بعد الموافقة، اضغط "📅 جدولة" لنقل الطلب إلى صفحة الجدول</li>
            <li>✅ في صفحة الجدول، استخدم "Import من الطلبات" لاستيراد الطلبات المجدولة تلقائياً</li>
          </ul>
        </div>
      </div>
      {showCustomers && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e293b] rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">👥 إدارة العملاء</h2>
              <button onClick={() => setShowCustomers(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <CustomersManager onSelect={(c) => {
              if (c) {
                setForm(prev => ({ ...prev, customerId: c.id, customerName: c.name, customerPhone: c.phone, customerCode: c.code }));
                setShowCustomers(false);
                setShowForm(true);
              }
            }} />
          </div>
        </div>
      )}

      {invoiceFor && (
        <EInvoice
          invoiceNo={`INV-${invoiceFor.id.slice(0, 6).toUpperCase()}`}
          date={invoiceFor.orderDate}
          time={invoiceFor.orderTime}
          customerName={invoiceFor.customerName}
          customerCode={invoiceFor.customerCode}
          customerPhone={invoiceFor.customerPhone}
          projectName={invoiceFor.projectName}
          orderType={invoiceFor.orderType}
          quantity={invoiceFor.quantity}
          concreteType={invoiceFor.concreteType}
          onClose={() => setInvoiceFor(null)}
        />
      )}
    </div>
  );
}
