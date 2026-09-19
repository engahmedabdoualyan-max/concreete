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
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

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

interface RiskClient {
  id: string;
  clientCode: string;
  companyName: string;
  creditLimitSar: number;
  outstandingBalanceSar: number;
  utilisationPct: number;
  isBlacklisted: boolean;
  riskScore: 'LOW' | 'MEDIUM' | 'HIGH';
  riskNotes: string | null;
  riskLastUpdatedAt: string | null;
}

interface RiskData {
  clients: RiskClient[];
  summary: Record<'LOW' | 'MEDIUM' | 'HIGH', number>;
  total: number;
}

const RISK_STYLE: Record<string, { badge: string; border: string }> = {
  HIGH: { badge: 'bg-red-500/20 text-red-300 border-red-500/50', border: 'border-red-500/40' },
  MEDIUM: { badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50', border: 'border-yellow-500/40' },
  LOW: { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', border: 'border-emerald-500/40' },
};

export default function ErpFinance() {
  const t = useErpDict();
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [riskBusy, setRiskBusy] = useState(false);
  const [riskError, setRiskError] = useState('');

  const load = () => {
    setError('');
    api.get<FinanceData>('/api/finance?status=PENDING_FINANCE&limit=20')
      .then(setData)
      .catch((e: any) => setError(e?.message || t('errLoadFinance')));
  };

  const loadRisk = () => {
    setRiskError('');
    api.get<RiskData>('/api/clients/risk')
      .then(setRiskData)
      .catch(() => setRiskData(null));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(load, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(loadRisk, []);

  const recalcRisk = async () => {
    setRiskBusy(true);
    setRiskError('');
    try {
      const res = await api.post<{ summary: Record<'LOW' | 'MEDIUM' | 'HIGH', number>; results: unknown[] }>('/api/clients/risk/recalculate', {});
      setRiskData(prev => prev ? { ...prev, summary: res.summary } : prev);
      loadRisk();
    } catch (e: any) {
      setRiskError(e?.message || t('errRiskRecalc'));
    } finally {
      setRiskBusy(false);
    }
  };

  const approve = async (orderId: string) => {
    setBusyId(orderId);
    try {
      await api.post('/api/finance/approve', { orderId, paperClearanceGranted: true });
      load();
    } catch (e: any) {
      setError(e?.message || t('errApprove'));
    } finally {
      setBusyId('');
    }
  };

  const reject = async (orderId: string) => {
    const r = (reason[orderId] || '').trim();
    if (r.length < 10) {
      setError(t('errRejectReason'));
      return;
    }
    setBusyId(orderId);
    try {
      await api.post('/api/finance/reject', { orderId, reason: r });
      load();
    } catch (e: any) {
      setError(e?.message || t('errReject'));
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
          <span>🏦</span> {t('financeHeader')}
        </h3>
        <button onClick={load} className="text-[11px] text-sky-300 border border-sky-500/30 rounded px-2 py-1 hover:bg-sky-500/10">
          {t('refresh')}
        </button>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {!data && !error && <div className="text-xs text-slate-400 py-4 text-center">{t('loadingFinance')}</div>}

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
              {t('clientsLabel')}<b className="text-white">{data.creditSummary?.totalClients ?? 0}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              {t('creditLimitLabel')}<b className="text-white">{(Number(data.creditSummary?.totalCreditLimitSar) || 0).toLocaleString()} {t('sar')}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              {t('dueLabel')}<b className="text-amber-300">{(Number(data.creditSummary?.totalOutstandingSar) || 0).toLocaleString()} {t('sar')}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              {t('overLimitLabel')}<b className={data.creditSummary?.overLimitCount ? 'text-red-400' : 'text-white'}>{data.creditSummary?.overLimitCount ?? 0}</b>
            </span>
            <span className="bg-white/[0.03] border border-white/10 rounded px-2 py-1">
              {t('blacklistedLabel')}<b className="text-red-400">{data.creditSummary?.blacklistedCount ?? 0}</b>
            </span>
          </div>

          {/* Automatic client risk assessment */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                {t('autoRiskHdr')}
              </h4>
              <div className="flex items-center gap-2">
                <ExportButtons
                  filename={t('fileNameRisk')}
                  title={t('financeExportTitle')}
                  subtitle={`${t('totalLabel')} ${riskData?.total ?? 0} ${t('clientUnit')}`}
                  columns={[
                    { header: t('client'), key: 'name' },
                    { header: t('riskScoreLabel'), key: 'score' },
                    { header: t('riskLevel'), key: 'level' },
                    { header: t('riskUtilisation'), key: 'util' },
                    { header: t('riskNotes'), key: 'notes' },
                  ]}
                  rows={(riskData?.clients ?? []).map(c => ({
                    name: c.companyName || c.clientCode,
                    score: c.riskScore,
                    level: c.riskScore === 'HIGH' ? t('riskHigh') : c.riskScore === 'MEDIUM' ? t('riskMedium') : t('riskLow'),
                    util: `${c.utilisationPct ?? 0}%`,
                    notes: c.riskNotes ?? '-',
                  }))}
                />
                <span className="text-[10px] text-slate-400">{t('lastUpdate')}{riskData?.clients?.[0]?.riskLastUpdatedAt ? new Date(riskData.clients[0].riskLastUpdatedAt).toLocaleDateString() : '-'}</span>
                <button
                  onClick={recalcRisk}
                  disabled={riskBusy}
                  className="text-[11px] bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded px-2 py-1 hover:bg-violet-500/30 disabled:opacity-40"
                >
                  {riskBusy ? t('recalcRiskBusy') : t('recalcRisk')}
                </button>
              </div>
            </div>
            {riskError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-2">{riskError}</div>}
            {!riskData && !riskError && <div className="text-xs text-slate-500">{t('loadingRisk')}</div>}
            {riskData && riskData.total > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
                  <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded px-2 py-0.5">{t('riskChipLow')}<b>{riskData.summary.LOW}</b></span>
                  <span className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded px-2 py-0.5">{t('riskChipMedium')}<b>{riskData.summary.MEDIUM}</b></span>
                  <span className="bg-red-500/10 border border-red-500/30 text-red-300 rounded px-2 py-0.5">{t('riskChipHigh')}<b>{riskData.summary.HIGH}</b></span>
                  <span className="bg-white/[0.03] border border-white/10 text-slate-400 rounded px-2 py-0.5">{t('riskTotalChip')}<b className="text-white">{riskData.total}</b></span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                      <tr>
                        <th className="p-2 text-right">{t('client')}</th>
                        <th className="p-2">{t('riskHeader')}</th>
                        <th className="p-2">{t('usage')}</th>
                        <th className="p-2">{t('outstanding')}</th>
                        <th className="p-2">{t('riskFactors')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskData.clients.map(c => (
                        <tr key={c.id} className={`border-b border-white/10 ${RISK_STYLE[c.riskScore]?.border}`}>
                          <td className="p-2 font-bold text-white">{c.companyName} <span className="text-slate-500 font-mono text-[9px]">({c.clientCode})</span></td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${RISK_STYLE[c.riskScore]?.badge}`}>
                              {c.riskScore === 'HIGH' ? t('riskBadgeHigh') : c.riskScore === 'MEDIUM' ? t('riskBadgeMedium') : t('riskBadgeLow')}
                            </span>
                            {c.isBlacklisted && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-red-600 text-white font-bold">⛔ BLACKLIST</span>}
                          </td>
                          <td className="p-2 font-mono">{c.utilisationPct}%</td>
                          <td className="p-2 font-mono text-amber-300">{c.outstandingBalanceSar.toLocaleString()}</td>
                          <td className="p-2 max-w-[260px] text-[10px] text-slate-400">
                            {c.riskNotes ? c.riskNotes.split('\n').map((n, i) => <div key={i}>• {n}</div>) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {riskData && riskData.total === 0 && <div className="text-xs text-slate-500">{t('noRiskClients')}</div>}
          </div>

          {/* Pending queue */}
          <div className="space-y-2">
            {data.queue.orders.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-3">{t('noPendingOrders')}</div>
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
                    <div className="text-sm font-black text-sky-300">{(o.orderValueSar).toLocaleString()} {t('sar')}</div>
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
                    {t('approveOrder')}
                  </button>
                  <input
                    value={reason[o.id] || ''}
                    onChange={e => setReason(r => ({ ...r, [o.id]: e.target.value }))}
                    placeholder={t('rejectReasonPlaceholder')}
                    className="flex-1 min-w-[160px] text-[11px] bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-slate-200 outline-none focus:border-red-400/60"
                  />
                  <button
                    onClick={() => reject(o.id)}
                    disabled={busyId === o.id}
                    className="text-[11px] bg-red-500/20 text-red-300 border border-red-500/40 rounded px-3 py-1.5 hover:bg-red-500/30 disabled:opacity-40"
                  >
                    {t('rejectOrder')}
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
