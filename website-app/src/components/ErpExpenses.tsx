/**
 * ============================================================
 *  FIMTO SOFT — ERP Expenses & Salaries (المصاريف والرواتب)
 * ============================================================
 *  Operating expenses + monthly payroll, both auto-linking
 *  ledger entries through the ERP backend.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

interface Expense {
  id: string;
  category: string;
  amountSar: number;
  date: string;
  paymentMethod: string;
  description: string | null;
  referenceNumber: string | null;
  vehicleName: string | null;
  vehiclePlate: string | null;
}

interface Salary {
  id: string;
  amountSar: number;
  month: string;
  paidOn: string;
  notes: string | null;
  employeeName: string | null;
  employeeRole: string | null;
}

interface Employee {
  id: string;
  fullName: string;
  role: string;
}

interface ExpensesData {
  expenses: Expense[];
  summary: { totalExpensesSar: number; totalSalariesSar: number; byCategory: { category: string; total: number }[] };
}

interface SalariesData {
  salaries: Salary[];
  summary: { totalExpensesSar: number; totalSalariesSar: number; byCategory: { category: string; total: number }[] };
  employees: Employee[];
}

const CAT_LABEL: Record<string, string> = {
  vehicle: 'expCatVehicle', fuel: 'expCatFuel', office: 'expCatOffice', materials: 'expCatMaterials',
  maintenance: 'expCatMaintenance', utilities: 'expCatUtilities', rent: 'expCatRent', salary: 'expCatSalary', other: 'expCatOther',
};

const PAY_LABEL: Record<string, string> = {
  cash: 'payModeCash', bank_transfer: 'payModeBank', credit_card: 'expPayCreditCard', upi: 'payModeUpi', cheque: 'payModeCheque',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpExpenses() {
  const t = useErpDict();
  const catLabel = (k: string) => t(CAT_LABEL[k] ?? k);
  const payLabel = (k: string) => t(PAY_LABEL[k] ?? k);
  const [tab, setTab] = useState<'expenses' | 'salaries'>('expenses');
  const [expData, setExpData] = useState<ExpensesData | null>(null);
  const [salData, setSalData] = useState<SalariesData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expForm, setExpForm] = useState({
    category: 'fuel', amountSar: '', date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'cash', description: '', referenceNumber: '',
  });
  const [salForm, setSalForm] = useState({
    employeeId: '', amountSar: '', month: new Date().toISOString().slice(0, 7) + '-01', paidOn: new Date().toISOString().slice(0, 10),
  });

  const loadExpenses = () => {
    setError('');
    api.get<ExpensesData>('/api/finance/expenses')
      .then(setExpData)
      .catch((e: any) => setError(e?.message || t('errLoadExpenses')));
  };

  const loadSalaries = () => {
    setError('');
    api.get<SalariesData>('/api/finance/salaries')
      .then(setSalData)
      .catch((e: any) => setError(e?.message || t('errLoadSalaries')));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    loadExpenses();
    loadSalaries();
  }, []);

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/expenses', {
        category: expForm.category,
        amountSar: Math.round((Number(expForm.amountSar) || 0) * 100),
        date: new Date(expForm.date).toISOString(),
        paymentMethod: expForm.paymentMethod,
        description: expForm.description || null,
        referenceNumber: expForm.referenceNumber || null,
      });
      setShowAdd(false);
      setExpForm({ category: 'fuel', amountSar: '', date: new Date().toISOString().slice(0, 10), paymentMethod: 'cash', description: '', referenceNumber: '' });
      loadExpenses();
    } catch (e: any) {
      setError(e?.message || t('errSaveExpense'));
    } finally {
      setBusy(false);
    }
  };

  const addSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/salaries', {
        employeeId: salForm.employeeId,
        amountSar: Math.round((Number(salForm.amountSar) || 0) * 100),
        month: new Date(salForm.month).toISOString(),
        paidOn: new Date(salForm.paidOn).toISOString(),
      });
      setSalForm({ employeeId: '', amountSar: '', month: new Date().toISOString().slice(0, 7) + '-01', paidOn: new Date().toISOString().slice(0, 10) });
      loadSalaries();
    } catch (e: any) {
      setError(e?.message || t('errSaveSalary'));
    } finally {
      setBusy(false);
    }
  };

  const s = expData?.summary;

  return (
    <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>🧾</span> {t('expensesHeader')}
        </h3>
        <div className="flex gap-2">
          <ExportButtons
            filename={tab === 'expenses' ? t('fileNameExpenses') : t('fileNameSalaries')}
            title={tab === 'expenses' ? t('expensesExportTitle') : t('salariesExportTitle')}
            columns={
              tab === 'expenses'
                ? [
                    { header: t('date'), key: 'date' },
                    { header: t('exportColCategory'), key: 'category' },
                    { header: t('description'), key: 'description' },
                    { header: t('amount'), key: 'amount' },
                    { header: t('method'), key: 'method' },
                    { header: t('exportColRef'), key: 'ref' },
                  ]
                : [
                    { header: t('exportColEmployee'), key: 'employee' },
                    { header: t('exportColMonth'), key: 'month' },
                    { header: t('exportColPaidOn'), key: 'paidOn' },
                    { header: t('amount'), key: 'amount' },
                  ]
            }
            rows={
              tab === 'expenses'
                ? (expData?.expenses ?? []).map(x => ({
                    date: new Date(x.date).toLocaleDateString(),
                    category: catLabel(x.category),
                    description: x.description ?? '-',
                    amount: `${fmtSar(x.amountSar)} ${t('sar')}`,
                    method: payLabel(x.paymentMethod),
                    ref: x.referenceNumber ?? '-',
                  }))
                : (salData?.salaries ?? []).map(x => ({
                    employee: x.employeeName ?? '-',
                    month: x.month,
                    paidOn: new Date(x.paidOn).toLocaleDateString(),
                    amount: `${fmtSar(x.amountSar)} ${t('sar')}`,
                  }))
            }
          />
          <div className="flex bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setTab('expenses')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'expenses' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{t('tabExpenses')}</button>
            <button onClick={() => setTab('salaries')} className={`px-3 py-1 text-[11px] font-bold ${tab === 'salaries' ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{t('tabSalaries')}</button>
          </div>
          <button onClick={() => setShowAdd(v => !v)} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
            {showAdd ? t('close') : t('addGeneric')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-red-300">{fmtSar(s?.totalExpensesSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('totalExpenses')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-sky-300">{fmtSar(s?.totalSalariesSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('totalSalaries')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{fmtSar((s?.totalExpensesSar ?? 0) + (s?.totalSalariesSar ?? 0))}</div>
          <div className="text-[10px] text-slate-400">{t('grandTotal')}</div>
        </div>
      </div>

      {s && s.byCategory.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {s.byCategory.map(c => (
            <span key={c.category} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
              {catLabel(c.category)}: {fmtSar(c.total)} {t('sar')}
            </span>
          ))}
        </div>
      )}

      {/* Add forms */}
      {showAdd && tab === 'expenses' && (
        <form onSubmit={addExpense} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
            {Object.keys(CAT_LABEL).filter(c => c !== 'salary').map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
          </select>
          <input type="number" step="0.01" value={expForm.amountSar} onChange={e => setExpForm({ ...expForm, amountSar: e.target.value })} placeholder={t('amountSarReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <select value={expForm.paymentMethod} onChange={e => setExpForm({ ...expForm, paymentMethod: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
            {Object.keys(PAY_LABEL).map(p => <option key={p} value={p}>{payLabel(p)}</option>)}
          </select>
          <input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} placeholder={t('description')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" />
          <input value={expForm.referenceNumber} onChange={e => setExpForm({ ...expForm, referenceNumber: e.target.value })} placeholder={t('invoiceNo')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <button type="submit" disabled={busy} className="col-span-2 md:col-span-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveExpense')}</button>
        </form>
      )}

      {showAdd && tab === 'salaries' && (
        <form onSubmit={addSalary} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <select value={salForm.employeeId} onChange={e => setSalForm({ ...salForm, employeeId: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
            <option value="">{t('employeeReq')}</option>
            {(salData?.employees ?? []).map(emp => <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.role})</option>)}
          </select>
          <input type="number" step="0.01" value={salForm.amountSar} onChange={e => setSalForm({ ...salForm, amountSar: e.target.value })} placeholder={t('amountSarReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="month" value={salForm.month.slice(0, 7)} onChange={e => setSalForm({ ...salForm, month: e.target.value + '-01' })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <input type="date" value={salForm.paidOn} onChange={e => setSalForm({ ...salForm, paidOn: e.target.value })} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <button type="submit" disabled={busy} className="col-span-2 md:col-span-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('paySalary')}</button>
        </form>
      )}

      {/* Expenses list */}
      {tab === 'expenses' && (
        <div className="overflow-x-auto">
          {!expData && !error && <div className="text-xs text-slate-400 py-4 text-center">{t('loading')}</div>}
          {expData && expData.expenses.length === 0 && <div className="text-xs text-slate-500 text-center py-4">{t('noExpenses')}</div>}
          {expData && expData.expenses.length > 0 && (
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                <tr>
                  <th className="p-2 text-right">{t('date')}</th>
                  <th className="p-2 text-right">{t('exportColCategory')}</th>
                  <th className="p-2 text-right">{t('description')}</th>
                  <th className="p-2">{t('amountSar')}</th>
                  <th className="p-2">{t('method')}</th>
                  <th className="p-2">{t('exportColRef')}</th>
                </tr>
              </thead>
              <tbody>
                {expData.expenses.map(x => (
                  <tr key={x.id} className="border-b border-white/10">
                    <td className="p-2 whitespace-nowrap">{new Date(x.date).toLocaleDateString()}</td>
                    <td className="p-2"><span className="px-2 py-0.5 rounded bg-white/10 text-slate-200 font-bold text-[10px]">{catLabel(x.category)}</span></td>
                    <td className="p-2 font-semibold text-white">{x.description || '-'}</td>
                    <td className="p-2 font-mono font-bold text-red-300">{fmtSar(x.amountSar)}</td>
                    <td className="p-2 text-slate-400">{payLabel(x.paymentMethod)}</td>
                    <td className="p-2 text-slate-500">{x.referenceNumber || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Salaries list */}
      {tab === 'salaries' && (
        <div className="overflow-x-auto">
          {!salData && !error && <div className="text-xs text-slate-400 py-4 text-center">{t('loading')}</div>}
          {salData && salData.salaries.length === 0 && <div className="text-xs text-slate-500 text-center py-4">{t('noSalaries')}</div>}
          {salData && salData.salaries.length > 0 && (
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                <tr>
                  <th className="p-2 text-right">{t('exportColEmployee')}</th>
                  <th className="p-2 text-right">{t('exportColMonth')}</th>
                  <th className="p-2 text-right">{t('exportColPaidOn')}</th>
                  <th className="p-2">{t('amountSar')}</th>
                </tr>
              </thead>
              <tbody>
                {salData.salaries.map(x => (
                  <tr key={x.id} className="border-b border-white/10">
                    <td className="p-2 font-semibold text-white">{x.employeeName || '—'}</td>
                    <td className="p-2 whitespace-nowrap">{x.month}</td>
                    <td className="p-2 whitespace-nowrap">{new Date(x.paidOn).toLocaleDateString()}</td>
                    <td className="p-2 font-mono font-bold text-sky-300">{fmtSar(x.amountSar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
