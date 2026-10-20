/**
 * ============================================================
 *  FIMTO SOFT — ERP قسم «نثريات» (Finance)
 * ============================================================
 *  بنزين الموظفين · إيجار سيارات الموظفين · سكن الموظفين.
 *  كل بند مربوط بموظف وفترة شهرية ويُنشئ قيداً دفترياً تلقائياً
 *  عبر /api/finance/misc-expenses (FINANCE_READ / FINANCE_CLIENT_UPDATE).
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

interface MiscRow {
  id: string;
  kind: string;
  employeeId: string | null;
  employeeFullName: string | null;
  employeeJob: string | null;
  periodMonth: string;
  amountSar: number;
  paymentDate: string;
  paymentMethod: string;
  notes: string | null;
  referenceNumber: string | null;
}

interface EmployeeOpt {
  id: string;
  fullName: string;
  jobTitle: string | null;
  employeeCode: string | null;
}

interface MiscData {
  miscExpenses: MiscRow[];
  summary: { byKind: { kind: string; total: number }[]; totalSar: number };
  employees: EmployeeOpt[];
}

const KINDS = ['employee_fuel', 'employee_car_rent', 'employee_housing'] as const;
const KIND_LABEL: Record<string, string> = {
  employee_fuel: 'miscKindFuel',
  employee_car_rent: 'miscKindCarRent',
  employee_housing: 'miscKindHousing',
};
const KIND_EMOJI: Record<string, string> = {
  employee_fuel: '⛽',
  employee_car_rent: '🚗',
  employee_housing: '🏠',
};
const METHOD_LABEL: Record<string, string> = {
  cash: 'payModeCash',
  bank_transfer: 'payModeBank',
  credit_card: 'payModeCredit',
  upi: 'payModeUpi',
  cheque: 'payModeCheque',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpMiscExpenses() {
  const t = useErpDict();
  const kindLabel = (k: string) => t(KIND_LABEL[k] ?? k);
  const methodLabel = (k: string) => t(METHOD_LABEL[k] ?? k);

  const [data, setData] = useState<MiscData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    kind: 'employee_fuel' as string,
    employeeId: '',
    periodMonth: new Date().toISOString().slice(0, 7),
    amountSar: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash',
    notes: '',
  });

  const load = () => {
    setError('');
    const sp = new URLSearchParams();
    if (month) {
      sp.set('year', month.slice(0, 4));
      sp.set('month', String(Number(month.slice(5, 7))));
    }
    api.get<MiscData>(`/api/finance/misc-expenses?${sp.toString()}`)
      .then(setData)
      .catch((e: any) => setError(e?.message || t('errLoad')));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(load, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/misc-expenses', {
        kind: form.kind,
        employeeId: form.employeeId,
        periodMonth: `${form.periodMonth}-01`,
        amountSar: Math.round((Number(form.amountSar) || 0) * 100),
        paymentDate: new Date(form.paymentDate).toISOString(),
        paymentMethod: form.paymentMethod,
        notes: form.notes || null,
      });
      setShowAdd(false);
      setForm({ ...form, employeeId: '', amountSar: '', notes: '' });
      load();
    } catch (err: any) {
      setError(err?.message || t('errAddSupplier'));
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (row: MiscRow) => {
    if (!window.confirm(`${t('miscDeleteEntry')} — ${kindLabel(row.kind)} · ${fmtSar(row.amountSar)} ${t('sar')}؟`)) return;
    setBusy(true);
    try {
      await api.del(`/api/finance/misc-expenses/${row.id}`);
      load();
    } catch (err: any) {
      setError(err?.message || t('errDelete'));
    } finally {
      setBusy(false);
    }
  };

  const kindTotal = (k: string) => data?.summary.byKind.find(x => x.kind === k)?.total ?? 0;

  return (
    <div className="bg-white/[0.02] border border-amber-500/20 rounded-xl p-4 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🧾</span> {t('miscTitle')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} onChange={e => { setMonth(e.target.value); }}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-white text-[11px]" />
          <ExportButtons
            filename={t('fileNameMisc')}
            title={`${t('miscExportTitle')} ${month ? `(${month})` : ''}`}
            columns={[
              { header: t('miscPeriod'), key: 'period' },
              { header: t('type'), key: 'kind' },
              { header: t('miscEmployee'), key: 'employee' },
              { header: t('amountSar'), key: 'amount' },
              { header: t('paymentMethod'), key: 'method' },
              { header: t('description'), key: 'notes' },
            ]}
            rows={(data?.miscExpenses ?? []).map(r => ({
              period: r.periodMonth.slice(0, 7),
              kind: kindLabel(r.kind),
              employee: r.employeeFullName ?? '—',
              amount: `${fmtSar(r.amountSar)} ${t('sar')}`,
              method: methodLabel(r.paymentMethod),
              notes: r.notes ?? '',
            }))}
          />
          <button onClick={() => setShowAdd(v => !v)}
            className="text-[11px] bg-amber-500/20 text-amber-200 border border-amber-500/40 rounded px-2 py-1 hover:bg-amber-500/30">
            {showAdd ? t('close') : t('miscAdd')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* Totals by kind */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {KINDS.map(k => (
          <div key={k} className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
            <div className="text-lg font-black text-amber-200">{fmtSar(kindTotal(k))}</div>
            <div className="text-[10px] text-slate-400">{KIND_EMOJI[k]} {kindLabel(k)}</div>
          </div>
        ))}
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{fmtSar(data?.summary.totalSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('total')} ({t('sar')})</div>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={save} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="col-span-2 md:col-span-4 text-[11px] font-black text-amber-200">{t('miscAdd')}</div>
          <select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
            <option value="">{t('miscEmployee')}</option>
            {(data?.employees ?? []).map(emp => (
              <option key={emp.id} value={emp.id}>{emp.fullName}{emp.jobTitle ? ` — ${emp.jobTitle}` : ''}</option>
            ))}
          </select>
          <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
            {KINDS.map(k => <option key={k} value={k}>{KIND_EMOJI[k]} {kindLabel(k)}</option>)}
          </select>
          <input type="month" value={form.periodMonth} onChange={e => setForm({ ...form, periodMonth: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="number" step="0.01" min="0.01" value={form.amountSar} onChange={e => setForm({ ...form, amountSar: e.target.value })}
            placeholder={t('amountSarReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
            {Object.keys(METHOD_LABEL).map(m => <option key={m} value={m}>{methodLabel(m)}</option>)}
          </select>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder={t('description')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2 md:col-span-2" />
          <div className="col-span-2 md:col-span-4 flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveSupplier')}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="bg-white/[0.06] border border-white/15 text-slate-300 font-bold py-1.5 rounded-lg text-xs px-3">{t('cancel')}</button>
          </div>
        </form>
      )}

      {(data?.miscExpenses ?? []).length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-4">{t('miscNoData')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-right px-2 py-2 font-black">{t('miscPeriod')}</th>
                <th className="text-right px-2 py-2 font-black">{t('type')}</th>
                <th className="text-right px-2 py-2 font-black">{t('miscEmployee')}</th>
                <th className="text-right px-2 py-2 font-black">{t('amountSar')}</th>
                <th className="text-right px-2 py-2 font-black">{t('paymentMethod')}</th>
                <th className="text-right px-2 py-2 font-black">{t('paymentDate')}</th>
                <th className="text-right px-2 py-2 font-black">{t('description')}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.miscExpenses ?? []).map(r => (
                <tr key={r.id} className="border-b border-white/5">
                  <td className="px-2 py-1.5 text-slate-300">{r.periodMonth.slice(0, 7)}</td>
                  <td className="px-2 py-1.5 font-bold text-white">{KIND_EMOJI[r.kind]} {kindLabel(r.kind)}</td>
                  <td className="px-2 py-1.5 text-slate-300">{r.employeeFullName ?? '—'}{r.employeeJob ? <span className="text-slate-500"> · {r.employeeJob}</span> : null}</td>
                  <td className="px-2 py-1.5 font-black text-amber-200">{fmtSar(r.amountSar)}</td>
                  <td className="px-2 py-1.5 text-slate-400">{methodLabel(r.paymentMethod)}</td>
                  <td className="px-2 py-1.5 text-slate-400">{new Date(`${r.paymentDate.slice(0, 10)}T00:00:00`).toLocaleDateString()}</td>
                  <td className="px-2 py-1.5 text-slate-400 max-w-[220px] truncate">{r.notes ?? r.referenceNumber ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button onClick={() => removeRow(r)} disabled={busy} title={t('miscDeleteEntry')}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500 mt-2">{t('miscHint')}</p>
    </div>
  );
}
