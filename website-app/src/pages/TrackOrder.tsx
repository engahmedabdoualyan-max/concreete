import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resolveApiBase } from '../api/client';
import BrandLogo from '../components/BrandLogo';

/**
 * ============================================================
 *  PUBLIC Customer Tracking Portal (Epic 2 — no login required)
 *  Route: #/track/:token
 * ============================================================
 *  Renders whatever the magic link unlocks:
 *   • ORDER scope → live delivery timeline + ticket + statement
 *   • CLIENT scope → customer home: orders + statements + balance
 *
 *  Plain fetch, no auth headers — the token is the credential.
 *  Fully standalone (works for logged-out customers).
 * ============================================================
 */

interface TimelineStep {
  checkpoint: string;
  loggedAt: string;
  ar: string;
  en: string;
  emoji: string;
}

interface Trip {
  tripNumber: string;
  loadedVolumeM3: string;
  currentCheckpoint: string;
  deliveryTicketNumber: string | null;
  isCompleted: boolean;
  signatureImage?: string | null;
  signedBy?: string | null;
  signedAt?: string | null;
  predictedEtaMinutes?: number | null;
  etaBasis?: string | null;
  drum?: {
    avgRpm: number | null;
    maxTempC: number | null;
    rotationStops: number;
    workability: string;
    remainingMinutes: number | null;
  } | null;
  timeline: TimelineStep[];
}

interface OrderPortal {
  scope: 'ORDER';
  order: {
    orderNumber: string;
    status: string;
    clientName: string;
    siteName: string;
    city: string;
    mix: string;
    scheduledDate: string;
    totalM3: number;
    deliveredM3: number;
    remainingM3: number;
    progressPct: number;
  };
  statement: {
    pricePerM3Sar: number;
    deliveredValueSar: number;
    totalValueSar: number;
    currency: string;
  };
  trips: Trip[];
}

interface ClientPortal {
  scope: 'CLIENT';
  client: { companyName: string; creditLimitSar: number; outstandingSar: number };
  summary: { ordersCount: number; totalBilledSar: number; currency: string };
  statements: {
    orderId: string;
    orderNumber: string;
    status: string;
    siteName: string;
    mix: string;
    scheduledDate: string;
    totalM3: number;
    deliveredM3: number;
    pricePerM3Sar: number;
    deliveredValueSar: number;
    totalValueSar: number;
  }[];
}

type PortalData = OrderPortal | ClientPortal;

const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة', PENDING_FINANCE: 'بانتظار المالية', CREDIT_HOLD: 'إيقاف ائتماني',
  FINANCE_REJECTED: 'مرفوض مالياً', APPROVED: 'معتمد', APPROVED_SCHEDULED: 'معتمد ومجدول',
  SCHEDULED: 'مجدول', IN_PRODUCTION: 'قيد الإنتاج', IN_TRANSIT: 'في الطريق',
  DELIVERED: 'تم التسليم', CANCELLED: 'ملغي', ON_HOLD: 'معلق',
};

export default function TrackOrder() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return; }
    fetch(`${resolveApiBase()}/api/public/portal/${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) throw new Error('not found');
        const j = await r.json();
        setData(j.data as PortalData);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200" dir="rtl">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={52} />
          <h1 className="text-sm font-bold text-white">📦 تتبع التسليم — بوابة العميل</h1>
        </div>
        <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">
          Fimto ERP
        </Link>
      </div>

      <main className="max-w-3xl mx-auto p-6">
        {loading && (
          <div className="text-center py-20 text-slate-400">⏳ جارِ تحميل بيانات التسليم...</div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🔒</p>
            <p className="text-red-400 text-xl font-bold mb-2">الرابط غير صالح أو منتهي الصلاحية</p>
            <p className="text-slate-400 text-sm">يرجى طلب رابط جديد من المورد.</p>
          </div>
        )}

        {data?.scope === 'ORDER' && <OrderView data={data} />}
        {data?.scope === 'CLIENT' && <ClientView data={data} />}
      </main>
    </div>
  );
}

function OrderView({ data }: { data: OrderPortal }) {
  const { order, statement, trips } = data;
  return (
    <div className="space-y-5">
      {/* Order header + progress */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-xl font-bold text-white">🧾 {order.orderNumber}</h2>
            <p className="text-xs text-slate-400 mt-1">{order.clientName} • {order.siteName}{order.city ? `، ${order.city}` : ''}</p>
            <p className="text-xs text-slate-400 mt-1">🧪 {order.mix}</p>
          </div>
          <span className="bg-sky-500/20 text-sky-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-sky-500/30">
            {STATUS_AR[order.status] ?? order.status}
          </span>
        </div>
        <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all" style={{ width: `${order.progressPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>تم التوريد: <b className="text-emerald-400">{order.deliveredM3} م³</b></span>
          <span>{order.progressPct}%</span>
          <span>الإجمالي: <b className="text-white">{order.totalM3} م³</b></span>
        </div>
      </div>

      {/* Statement */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="font-bold text-white mb-3">💰 كشف الحساب</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">سعر المتر</p>
            <p className="text-white font-bold">{statement.pricePerM3Sar} ر.س</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">قيمة المورَّد</p>
            <p className="text-emerald-400 font-bold">{statement.deliveredValueSar.toLocaleString()} ر.س</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">إجمالي الطلب</p>
            <p className="text-white font-bold">{statement.totalValueSar.toLocaleString()} ر.س</p>
          </div>
        </div>
      </div>

      {/* Trips timeline */}
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="font-bold text-white mb-4">🚚 الرحلات ({trips.length})</h3>
        <div className="space-y-4">
          {trips.map(t => (
            <div key={t.tripNumber} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <p className="font-bold text-white text-sm">{t.tripNumber} <span className="text-slate-400 font-normal">• {t.loadedVolumeM3} م³</span></p>
                <div className="flex gap-2">
                  {t.predictedEtaMinutes != null && t.predictedEtaMinutes > 0 && (
                    <span className="text-[11px] bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded text-amber-300">⏱️ الوصول خلال ~{t.predictedEtaMinutes} دقيقة{t.etaBasis === 'HISTORY' ? ' (متوقع ذكي)' : ''}</span>
                  )}
                  {t.drum && (
                    <span className={`text-[11px] px-2 py-1 rounded border ${t.drum.workability === 'EXPIRED' ? 'bg-red-500/15 border-red-500/30 text-red-300' : t.drum.workability === 'AGING' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-sky-500/15 border-sky-500/30 text-sky-300'}`}>
                      🥁 {t.drum.avgRpm != null ? `${t.drum.avgRpm} RPM` : 'بث البرميل'} • {t.drum.workability === 'FRESH' ? 'طازجة' : t.drum.workability === 'AGING' ? 'تقترب من النهاية' : t.drum.workability === 'EXPIRED' ? 'تجاوزت الصلاحية' : '—'}
                    </span>
                  )}
                  {t.signatureImage && (
                    <span className="text-[11px] bg-emerald-500/15 border border-emerald-500/30 px-2 py-1 rounded text-emerald-300">✍️ موقّعة{t.signedBy ? ` — ${t.signedBy}` : ''}</span>
                  )}
                  {t.deliveryTicketNumber && (
                    <span className="text-[11px] bg-white/[0.05] border border-white/10 px-2 py-1 rounded text-slate-300">🎫 {t.deliveryTicketNumber}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {t.timeline.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 shrink-0">
                    <div className="flex flex-col items-center bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2 py-1.5 min-w-[64px]">
                      <span className="text-base">{s.emoji}</span>
                      <span className="text-[10px] text-emerald-300 font-bold whitespace-nowrap">{s.ar}</span>
                      <span className="text-[9px] text-slate-500">{new Date(s.loggedAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {i < t.timeline.length - 1 && <span className="text-emerald-500 text-xs">◀</span>}
                  </div>
                ))}
                {t.timeline.length === 0 && <p className="text-xs text-slate-500">بانتظار بدء الرحلة...</p>}
              </div>
              {t.signatureImage && (
                <div className="mt-3 bg-white rounded-xl p-3 flex items-center gap-3">
                  <img src={t.signatureImage} alt="توقيع العميل" className="h-16 w-auto object-contain border border-slate-200 rounded" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">✍️ توقيع الاستلام</p>
                    <p className="text-xs text-slate-500">{t.signedBy ?? ''}{t.signedAt ? ` • ${new Date(t.signedAt).toLocaleString('ar')}` : ''}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
          {trips.length === 0 && <p className="text-sm text-slate-500 text-center py-4">لا توجد رحلات بعد لهذا الطلب.</p>}
        </div>
      </div>
    </div>
  );
}

function ClientView({ data }: { data: ClientPortal }) {
  const { client, summary, statements } = data;
  return (
    <div className="space-y-5">
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="text-xl font-bold text-white">🏢 {client.companyName}</h2>
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">الطلبات</p>
            <p className="text-white font-bold text-xl">{summary.ordersCount}</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">إجمالي المورَّد</p>
            <p className="text-emerald-400 font-bold">{summary.totalBilledSar.toLocaleString()} ر.س</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-400">الرصيد المستحق</p>
            <p className="text-amber-400 font-bold">{client.outstandingSar.toLocaleString()} ر.س</p>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
        <h3 className="font-bold text-white mb-4">📋 طلباتي وكشوفاتي</h3>
        <div className="space-y-3">
          {statements.map(s => (
            <div key={s.orderId} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-white text-sm">{s.orderNumber}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{s.siteName} • 🧪 {s.mix}</p>
                </div>
                <span className="bg-sky-500/20 text-sky-300 text-[10px] px-2 py-1 rounded font-bold">{STATUS_AR[s.status] ?? s.status}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>المورَّد: <b className="text-emerald-400">{s.deliveredM3}/{s.totalM3} م³</b></span>
                <span>القيمة: <b className="text-white">{s.deliveredValueSar.toLocaleString()} ر.س</b></span>
              </div>
            </div>
          ))}
          {statements.length === 0 && <p className="text-sm text-slate-500 text-center py-4">لا توجد طلبات بعد.</p>}
        </div>
      </div>
    </div>
  );
}
