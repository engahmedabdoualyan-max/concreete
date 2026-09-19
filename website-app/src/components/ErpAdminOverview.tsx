/**
 * ============================================================
 *  FIMTO SOFT — Admin panel: ERP new-features overview
 *  Live aggregates from the ERP backend + quick links.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useErpDict } from '../i18n/erpDict';

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

interface ErpOverview {
  accounts: number;
  balanceSar: number;
  debitsSar: number;
  creditsSar: number;
  commitments: number;
  overdueCommitments: number;
  monthlyCommitmentsSar: number;
  expenses: number;
  expensesTotalSar: number;
  salariesTotalSar: number;
  pos: number;
  openPos: number;
  poTotalSar: number;
  lowSilos: number;
  criticalSilos: number;
  riskHigh: number;
  riskClients: number;
}

function Stat({ emoji, label, value, sub, tone = 'text-white' }: { emoji: string; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-white/[0.02] rounded-xl p-4">
      <p className="text-xs text-slate-400">{emoji} {label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ErpAdminOverview({ onToast }: { onToast: (msg: string) => void }) {
  const t = useErpDict();
  const navigate = useNavigate();
  const [d, setD] = useState<ErpOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setBusy(true);
    setErr('');
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch((e: any) => {
      if (/401|Unauthorized|not signed in|توكن/i.test(String(e?.message))) setErr(t('adminLoginRequired'));
      return null;
    });

    const [ledger, commit, exp, sal, po, inv, risk] = await Promise.all([
      safe(api.get<any>('/api/finance/ledger')),
      safe(api.get<any>('/api/finance/commitments')),
      safe(api.get<any>('/api/finance/expenses')),
      safe(api.get<any>('/api/finance/salaries')),
      safe(api.get<any>('/api/suppliers/purchase-orders')),
      safe(api.get<any>('/api/inventory')),
      safe(api.get<any>('/api/clients/risk')),
    ]);

    const commitSummary = commit?.summary ?? {};
    const expensesTotal = (exp?.expenses ?? []).reduce((s: number, x: any) => s + Number(x.amountSar || 0), 0);
    const salariesTotal = (sal?.salaries ?? []).reduce((s: number, x: any) => s + Number(x.amountSar || 0), 0);
    const posList = po?.purchaseOrders ?? [];
    const silos = inv?.silos ?? [];

    setD({
      accounts: ledger?.summary?.totalAccounts ?? ledger?.accounts?.length ?? 0,
      balanceSar: ledger?.summary?.totalBalanceSar ?? 0,
      debitsSar: ledger?.summary?.totalDebitsSar ?? 0,
      creditsSar: ledger?.summary?.totalCreditsSar ?? 0,
      commitments: commit?.commitments?.length ?? 0,
      overdueCommitments: commit?.overdue?.length ?? 0,
      monthlyCommitmentsSar: commitSummary?.monthlyTotalSar ?? 0,
      expenses: exp?.expenses?.length ?? 0,
      expensesTotalSar: expensesTotal,
      salariesTotalSar: salariesTotal,
      pos: posList.length,
      openPos: posList.filter((p: any) => p.status !== 'RECEIVED' && p.status !== 'CANCELLED').length,
      poTotalSar: posList.reduce((s: number, p: any) => s + Number(p.totalAmountSar || 0), 0),
      lowSilos: silos.filter((s: any) => s.isLowStock).length,
      criticalSilos: inv?.alerts?.criticalSilos?.length ?? silos.filter((s: any) => s.isCritical).length,
      riskHigh: risk?.summary?.HIGH ?? 0,
      riskClients: risk?.total ?? 0,
    });
    setBusy(false);
    onToast(t('adminToast'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">{t('adminHeader')}</h3>
            <p className="text-xs text-slate-400 mt-1">{t('adminSub')}</p>
          </div>
          <button
            onClick={load}
            disabled={busy}
            className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300"
          >
            {busy ? t('refreshAdminBusy') : t('refreshAdmin')}
          </button>
        </div>

        {err && <div className="mb-4 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">{err}</div>}
        {!d && !err && <div className="text-sm text-slate-400 py-6 text-center">{t('loadingAdminData')}</div>}

        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Stat emoji="🏦" label={t('statAccounts')} value={String(d.accounts)} sub={`${t('totalBalancePrefix')} ${fmtSar(d.balanceSar)} ${t('sar')}`} />
              <Stat emoji="📒" label={t('statLedger')} value={`${fmtSar(d.debitsSar)} / ${fmtSar(d.creditsSar)} ${t('sar')}`} sub={t('debitCredit')} tone="text-emerald-400" />
              <Stat emoji="🗓️" label={t('statCommitments')} value={String(d.commitments)} sub={d.overdueCommitments > 0 ? `⚠️ ${d.overdueCommitments} ${t('overdueSuffix')}` : `${t('monthlyPrefix')} ${fmtSar(d.monthlyCommitmentsSar)} ${t('sar')}`} tone={d.overdueCommitments > 0 ? 'text-red-400' : 'text-white'} />
              <Stat emoji="💸" label={t('statExpenses')} value={String(d.expenses)} sub={`${fmtSar(d.expensesTotalSar)} ${t('sar')}`} />
              <Stat emoji="👥" label={t('statSalaries')} value={fmtSar(d.salariesTotalSar)} sub={`${t('sar')} ${t('currentMonth')}`} />
              <Stat emoji="📦" label={t('statPOs')} value={String(d.pos)} sub={`${d.openPos} ${t('openSuffix')} · ${fmtSar(d.poTotalSar)} ${t('sar')}`} />
              <Stat emoji="🛢️" label={t('statLowSilos')} value={String(d.lowSilos)} sub={`${d.criticalSilos} ${t('criticalSuffix')}`} tone={d.criticalSilos > 0 ? 'text-red-400' : d.lowSilos > 0 ? 'text-yellow-400' : 'text-white'} />
              <Stat emoji="🛡️" label={t('statRisk')} value={String(d.riskHigh)} sub={`${t('ofTotalPrefix')} ${d.riskClients} ${t('clientUnit')}`} tone={d.riskHigh > 0 ? 'text-red-400' : 'text-emerald-400'} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/finance')}
                className="bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                {t('openFinance')}
              </button>
              <button
                onClick={() => navigate('/materials')}
                className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25 px-5 py-2.5 rounded-lg font-bold text-sm transition-colors"
              >
                {t('openMaterials')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
