/**
 * ============================================================
 *  FIMTO SOFT — ERP Operational Commitments (الالتزامات التشغيلية)
 * ============================================================
 *  Recurring obligations (EMI, lease, insurance, utilities...) with
 *  payment recording → auto-linked ledger entries.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

interface CommitmentPayment {
  id: string;
  amountSar: number;
  paymentDate: string;
  paymentMode: string;
  referenceNumber: string | null;
  remarks: string | null;
}

interface Commitment {
  id: string;
  title: string;
  commitmentType: string;
  description: string | null;
  amountSar: number;
  referenceNumber: string | null;
  startDate: string;
  endDate: string | null;
  paymentFrequency: string;
  paymentDay: number;
  nextPaymentDate: string;
  currentPaymentIsPaid: boolean;
  status: string;
  isActive: boolean;
  payeeName: string;
  contactPhone: string | null;
  notes: string | null;
  payments: CommitmentPayment[];
}

interface CommitmentsData {
  commitments: Commitment[];
  overdue: Commitment[];
  summary: {
    total: number;
    active: number;
    monthlyTotalSar: number;
    nextPaymentSar: number;
  };
}

const TYPE_LABEL: Record<string, string> = {
  emi: 'commitTypeEmi', lease: 'commitTypeLease', insurance: 'commitTypeInsurance', maintenance: 'commitTypeMaintenance',
  utilities: 'expCatUtilities', rent: 'expCatRent', other: 'expCatOther',
};

const FREQ_LABEL: Record<string, string> = {
  monthly: 'freqMonthly', quarterly: 'freqQuarterly', half_yearly: 'freqHalfYearly', yearly: 'freqYearly', one_time: 'freqOneTime',
};

const MODE_LABEL: Record<string, string> = {
  CASH: 'payModeCash', CHEQUE: 'payModeCheque', BANK: 'payModeBank', UPI: 'payModeUpi', AUTO_DEBIT: 'payModeAutoDebit', OTHER: 'payModeOther',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpCommitments() {
  const t = useErpDict();
  const typeLabel = (k: string) => t(TYPE_LABEL[k] ?? k);
  const freqLabel = (k: string) => t(FREQ_LABEL[k] ?? k);
  const modeLabel = (k: string) => t(MODE_LABEL[k] ?? k);
  const [data, setData] = useState<CommitmentsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [payFor, setPayFor] = useState<Commitment | null>(null);
  const [form, setForm] = useState({
    title: '', commitmentType: 'emi', amountSar: '', paymentFrequency: 'monthly',
    paymentDay: '1', payeeName: '', startDate: new Date().toISOString().slice(0, 10),
    referenceNumber: '',
  });
  const [payForm, setPayForm] = useState({
    amountSar: '', paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: 'BANK', referenceNumber: '',
  });

  const load = () => {
    setError('');
    api.get<CommitmentsData>('/api/finance/commitments')
      .then(setData)
      .catch((e: any) => setError(e?.message || t('errLoadCommitments')));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(load, []);

  const addCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/commitments', {
        title: form.title,
        commitmentType: form.commitmentType,
        amountSar: Math.round((Number(form.amountSar) || 0) * 100),
        paymentFrequency: form.paymentFrequency,
        paymentDay: Number(form.paymentDay) || 1,
        payeeName: form.payeeName,
        startDate: new Date(form.startDate).toISOString(),
        referenceNumber: form.referenceNumber || null,
      });
      setShowAdd(false);
      load();
    } catch (e: any) {
      setError(e?.message || t('errAddCommitment'));
    } finally {
      setBusy(false);
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payFor) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/commitments/payments', {
        commitmentId: payFor.id,
        amountSar: Math.round((Number(payForm.amountSar) || 0) * 100),
        paymentDate: new Date(payForm.paymentDate).toISOString(),
        paymentMode: payForm.paymentMode,
        referenceNumber: payForm.referenceNumber || null,
      });
      setPayFor(null);
      load();
    } catch (e: any) {
      setError(e?.message || t('errRecordPayment'));
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const overdueIds = new Set((data?.overdue ?? []).map(o => o.id));

  return (
    <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🗓️</span> {t('commitmentsHeader')}
        </h3>
        <div className="flex gap-2">
          <ExportButtons
            filename={t('fileNameCommitments')}
            title={t('commitmentExportTitle')}
            subtitle={`${t('totalLabel')} ${fmtSar(data?.summary.total ?? 0)} ${t('sar')} · ${data?.commitments.length ?? 0} ${t('commitmentsUnit')}`}
            columns={[
              { header: t('name'), key: 'name' },
              { header: t('type'), key: 'type' },
              { header: t('exportColPartyOrg'), key: 'party' },
              { header: t('exportColValue'), key: 'amount' },
              { header: t('paid'), key: 'paid' },
              { header: t('nextPayment'), key: 'next' },
              { header: t('status'), key: 'status' },
            ]}
            rows={(data?.commitments ?? []).map(c => ({
              name: c.title,
              type: typeLabel(c.commitmentType),
              party: c.payeeName ?? '-',
              amount: `${fmtSar(c.amountSar)} ${t('sar')}`,
              paid: `${fmtSar(c.payments.reduce((s, p) => s + p.amountSar, 0))} ${t('sar')}`,
              next: new Date(c.nextPaymentDate).toLocaleDateString(),
              status: c.isActive ? (c.currentPaymentIsPaid ? t('commitmentPaid') : t('commitActive')) : t('commitmentStopped'),
            }))}
          />
          <button onClick={load} className="text-[11px] text-emerald-300 border border-emerald-500/30 rounded px-2 py-1 hover:bg-emerald-500/10">{t('refresh')}</button>
          <button onClick={() => setShowAdd(v => !v)} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
            {showAdd ? t('close') : t('newCommitment')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}
      {!data && !error && <div className="text-xs text-slate-400 py-4 text-center">{t('loadingCommitments')}</div>}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-white">{s?.active ?? 0}<span className="text-[10px] text-slate-400"> / {s?.total}</span></div>
              <div className="text-[10px] text-slate-400">{t('activeCommitments')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-sky-300">{fmtSar(s?.monthlyTotalSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('monthlyBurden')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-red-300">{fmtSar(s?.nextPaymentSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('nextDues')}</div>
            </div>
            <div className={`${overdueIds.size ? 'bg-red-500/10 border-red-500/40' : 'bg-white/[0.03] border-white/10'} border rounded-lg p-2 text-center`}>
              <div className={`text-lg font-black ${overdueIds.size ? 'text-red-400' : 'text-slate-300'}`}>{overdueIds.size}</div>
              <div className="text-[10px] text-slate-400">{t('overdueCount')}</div>
            </div>
          </div>

          {/* Add commitment */}
          {showAdd && (
            <form onSubmit={addCommitment} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={t('titleReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <input value={form.payeeName} onChange={e => setForm({ ...form, payeeName: e.target.value })} placeholder={t('payeeReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <select value={form.commitmentType} onChange={e => setForm({ ...form, commitmentType: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                {Object.keys(TYPE_LABEL).map(tp => <option key={tp} value={tp}>{typeLabel(tp)}</option>)}
              </select>
              <input type="number" step="0.01" value={form.amountSar} onChange={e => setForm({ ...form, amountSar: e.target.value })} placeholder={t('amountSarReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              <select value={form.paymentFrequency} onChange={e => setForm({ ...form, paymentFrequency: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                {Object.keys(FREQ_LABEL).map(tp => <option key={tp} value={tp}>{freqLabel(tp)}</option>)}
              </select>
              <input type="number" min="1" max="31" value={form.paymentDay} onChange={e => setForm({ ...form, paymentDay: e.target.value })} placeholder={t('paymentDay')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <input value={form.referenceNumber} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} placeholder={t('contractNo')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              <button type="submit" disabled={busy} className="col-span-2 md:col-span-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveCommitment')}</button>
            </form>
          )}

          {/* Commitments list */}
          {data.commitments.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-4">{t('noCommitments')}</div>
          ) : (
            <div className="space-y-2">
              {data.commitments.map(c => {
                const overdue = overdueIds.has(c.id);
                return (
                  <div key={c.id} className={`border rounded-lg p-3 ${overdue ? 'bg-red-500/5 border-red-500/40' : 'bg-white/[0.03] border-white/10'}`}>
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          {c.title}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-300">{typeLabel(c.commitmentType)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${c.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : c.status === 'completed' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-500/20 text-slate-300'}`}>
                            {c.status === 'active' ? t('commitActive') : c.status === 'completed' ? t('commitCompleted') : t('commitFinished')}
                          </span>
                          {overdue && <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/30 text-red-200 font-bold">{t('commitOverdue')}</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {c.payeeName} · {freqLabel(c.paymentFrequency)}
                          {c.referenceNumber ? ` · ${c.referenceNumber}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-white">{fmtSar(c.amountSar)} <span className="text-[10px] text-slate-400">{t('sar')}</span></div>
                        <div className="text-[10px] text-slate-400">{t('nextPaymentLabel')}{new Date(c.nextPaymentDate).toLocaleDateString()}</div>
                      </div>
                    </div>

                    {/* Payments history */}
                    {c.payments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.payments.map(p => (
                          <span key={p.id} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                            {fmtSar(p.amountSar)} {t('sar')} · {new Date(p.paymentDate).toLocaleDateString()} · {modeLabel(p.paymentMode)}
                          </span>
                        ))}
                      </div>
                    )}

                    {c.status === 'active' && (
                      <button onClick={() => { setPayFor(c); setPayForm({ amountSar: String(c.amountSar / 100), paymentDate: new Date().toISOString().slice(0, 10), paymentMode: 'BANK', referenceNumber: '' }); }} className="mt-2 text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
                        {t('recordPayment')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Record payment modal */}
          {payFor && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 w-full max-w-sm">
                <h4 className="text-sm font-bold text-white mb-1">{t('recordPayment')} — {payFor.title}</h4>
                <p className="text-[11px] text-slate-400 mb-4">{t('originalAmount')} {fmtSar(payFor.amountSar)} {t('sar')} · {t('nextPayment')} {new Date(payFor.nextPaymentDate).toLocaleDateString()}</p>
                <form onSubmit={recordPayment} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('amountSarReq')}</label>
                    <input type="number" step="0.01" value={payForm.amountSar} onChange={e => setPayForm({ ...payForm, amountSar: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('paymentDate')}</label>
                    <input type="date" value={payForm.paymentDate} onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('paymentMethod')}</label>
                    <select value={payForm.paymentMode} onChange={e => setPayForm({ ...payForm, paymentMode: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                      {Object.keys(MODE_LABEL).map(m => <option key={m} value={m}>{modeLabel(m)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">{t('txnRefNo')}</label>
                    <input value={payForm.referenceNumber} onChange={e => setPayForm({ ...payForm, referenceNumber: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" disabled={busy} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs disabled:opacity-40">{t('confirmPayment')}</button>
                    <button type="button" onClick={() => setPayFor(null)} className="px-4 border border-white/20 text-slate-300 rounded-lg text-xs">{t('cancel')}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
