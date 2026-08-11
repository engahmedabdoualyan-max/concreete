/**
 * ============================================================
 *  FIMTO SOFT — ERP Finance Pipeline (unified data)
 * ============================================================
 *  Live feed from the ERP /api/finance: order credit-approval
 *  queue, pipeline counts and credit summary. Shown to
 *  SUPER_ADMIN / ACCOUNTANT roles only.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface PendingOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalVolumeM3: string;
  pricePerM3Sar: number;
  scheduledDate: string | null;
  paperClearanceGranted: boolean;
  financeRejectionReason: string | null;
  clientCode: string;
  companyName: string;
  creditLimitSar: number;
  outstandingBalanceSar: number;
  isBlacklisted: boolean;
  repName: string;
  siteName: string;
  designCode: string;
  gradeDescription: string;
  creditUtilisationPct: number;
  creditAvailableSar: number;
  orderValueSar: number;
  wouldExceedCreditLimit: boolean;
}

interface FinanceData {
  queue: { orders: PendingOrder[] };
  creditSummary: { totalClients: number; totalCreditLimitSar: number; totalOutstandingSar: number; blacklistedCount: number; overLimitCount: number };
  pipelineCounts: { status: string; count: number; totalVolume: string }[];
}

export default function ErpFinance() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = () => {
    setError('');
    api.get<FinanceData>('/api/finance?status=PENDING_FINANCE&limit=20')
      .then(setData)
      .catch((e: any) => setError(e?.message || 'تعذر تحميل بيانات المالية'));
  };

  useEffect(load, []);

  const approve = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await api.post('/api/finance/approve', { orderId, paperClearanceGranted: true });
      load();
    } catch (e: any) {
      setError(e?.message || 'فشل الموافقة');
    } finally {
      setBusyId('');
    }
  };

  const reject = async (orderId: string) => {
    const r = (reason[orderId] || '').trim();
    if (r.length < 10) {
      setError('سبب الرفض مطلوب (10 أحرف على الأقل)');
      return;
    }
    setBusyId(orderId);
    try {
      await api.post('/api/finance/reject', { orderId, reason: r });
      load();
    } catch (e: any) {
      setError(e?.message || 'فشل الرفض');
    } finally {
      setBusyId('');
    }
  };

  const pipeline = (data?.pipelineCounts || []).reduce<Record<string, { count: number; volume: number }>>((acc, p) => {
    acc[p.status] = { count: p.count, volume: Number(p.totalVolume) || 0 };
    return acc;
  }, {});

  return (
    <div className="bg-white/[0.02] border border-sky-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🏦</span> طابور الاعتمادات — النظام الموحد (ERP)
        </h3>
        <button onClick={load} className="text-[11px] text-sky-300 border border-sky-500/30 rounded px-2 py-1 hover:bg-sky-500/10">
          تحديث ↻
        </button>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {!data && !error && <div className="text-xs text-slate-400 py-4 text-center">جاري تحميل البيانات الموحدة...</div>}

      {data && (
        <>
          {/* Pipeline counts */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
            {['PENDING_FINANCE', 'APPROVED', 'FINANCE_REJECTED', 'ON_HOLD', 'CANCELLED'].map(s => (
              <div key={s} className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
                <div className="text-lg font-black text-white">{pipeline[s]?.count ?? 0}</div>
                <div className="text-[10px] text-slate-400 font-mono" dir="ltr">{s}</div>
                <div className="text-[10px] text-sky-300">{((pipeline[s]?.volume || 0)).toLocaleString()} m³</div>
              </div>
            ))}
          </div>

          {/* Credit summary */}
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-300 mb-4">
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              عملاء: <b className="text-white">{data.creditSummary?.totalClients ?? 0}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              حد الائتمان: <b className="text-white">{(Number(data.creditSummary?.totalCreditLimitSar) || 0).toLocaleString()} ر.س</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              مستحق: <b className="text-amber-300">{(Number(data.creditSummary?.totalOutstandingSar) || 0).toLocaleString()} ر.س</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              تجاوز الحد: <b className={data.creditSummary?.overLimitCount ? 'text-red-400' : 'text-white'}>{data.creditSummary?.overLimitCount ?? 0}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              محظور: <b className="text-red-400">{data.creditSummary?.blacklistedCount ?? 0}</b>
            </span>
          </div>

          {/* Pending queue */}
          <div className="space-y-2">
            {data.queue.orders.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-3">لا توجد طلبات بانتظار الاعتماد ✓</div>
            )}
            {data.queue.orders.map(o => (
              <div key={o.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                      {o.companyName} <span className="text-slate-500 font-mono text-[10px]">({o.clientCode})</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {o.designCode} {o.gradeDescription && `· ${o.gradeDescription}`} · {o.siteName} · {o.repName}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      <span className="font-mono" dir="ltr">{o.orderNumber}</span> · {o.totalVolumeM3} m³ · {o.scheduledDate?.slice(0, 10)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-sky-300">{(o.orderValueSar).toLocaleString()} ر.س</div>
                    <div className={`text-[10px] font-mono ${o.wouldExceedCreditLimit ? 'text-red-400' : 'text-green-400'}`}>
                      credit {o.creditUtilisationPct}% · avail {o.creditAvailableSar.toLocaleString()}
                      {o.isBlacklisted && ' · ⛔ BLACKLISTED'}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => approve(o.id)}
                    disabled={busyId === o.id}
                    className="text-[11px] bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold rounded px-3 py-1.5 hover:from-emerald-400 hover:to-green-400 disabled:opacity-40"
                  >
                    ✓ اعتماد
                  </button>
                  <input
                    value={reason[o.id] || ''}
                    onChange={e => setReason(r => ({ ...r, [o.id]: e.target.value }))}
                    placeholder="سبب الرفض (إلزامي)"
                    className="flex-1 min-w-[160px] text-[11px] bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-red-400/60"
                  />
                  <button
                    onClick={() => reject(o.id)}
                    disabled={busyId === o.id}
                    className="text-[11px] bg-red-500/20 text-red-300 border border-red-500/40 rounded px-3 py-1.5 hover:bg-red-500/30 disabled:opacity-40"
                  >
                    ✕ رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
