/**
 * ============================================================
 *  FIMTO SOFT — ERP Unified Ledger (دفتر الأستاذ الموحّد)
 * ============================================================
 *  Bank accounts + ledger entries + bank transactions, backed by
 *  the ERP PostgreSQL `/api/finance/ledger` endpoints.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch: string | null;
  initialBalanceSar: number;
  currentBalanceSar: number;
  isActive: boolean;
}

interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  amountSar: number;
  transactionType: string;
  referenceNumber: string | null;
  bankAccountId: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  bankAccountName: string | null;
  bankName: string | null;
}

interface BankTx {
  id: string;
  bankAccountId: string;
  transactionType: string;
  amountSar: number;
  date: string;
  description: string;
  bankAccountName: string | null;
  destinationAccountName: string | null;
}

interface LedgerData {
  accounts: BankAccount[];
  entries: LedgerEntry[];
  transactions: BankTx[];
  summary: { totalAccounts: number; totalBalanceSar: number; totalDebitsSar: number; totalCreditsSar: number };
}

const TYPE_LABEL: Record<string, string> = {
  income: 'typeIncome', expense: 'typeExpense', transfer: 'typeTransfer', purchase: 'typePurchase',
  sale: 'typeSale', adjustment: 'typeAdjustment', operational: 'typeOperational',
};

const TYPE_COLOR: Record<string, string> = {
  income: 'bg-emerald-500/20 text-emerald-300', sale: 'bg-emerald-500/20 text-emerald-300',
  expense: 'bg-red-500/20 text-red-300', purchase: 'bg-red-500/20 text-red-300',
  transfer: 'bg-sky-500/20 text-sky-300', adjustment: 'bg-yellow-500/20 text-yellow-300',
  operational: 'bg-violet-500/20 text-violet-300',
};

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpLedger() {
  const t = useErpDict();
  const typeLabel = (k: string) => t(TYPE_LABEL[k] ?? k);
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [accForm, setAccForm] = useState({ accountName: '', accountNumber: '', bankName: '', branch: '', initialBalanceSar: '' });
  const [entryForm, setEntryForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    transactionType: 'income' as string,
    description: '',
    amountSar: '',
    bankAccountId: '',
    counterpartyName: '',
    destinationAccountId: '',
  });

  const load = async () => {
    try {
      const d = await api.get<LedgerData>('/api/finance/ledger');
      setData(d);
    } catch (e: any) {
      setError(e?.message || t('errLoadLedger'));
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
  useEffect(() => { void load(); }, []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/finance/ledger', {
        accountName: accForm.accountName,
        accountNumber: accForm.accountNumber,
        bankName: accForm.bankName,
        branch: accForm.branch || null,
        initialBalanceSar: Math.round((Number(accForm.initialBalanceSar) || 0) * 100),
      });
      setAccForm({ accountName: '', accountNumber: '', bankName: '', branch: '', initialBalanceSar: '' });
      setShowAddAccount(false);
      load();
    } catch (e: any) {
      setError(e?.message || t('errAddAccount'));
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round((Number(entryForm.amountSar) || 0) * 100);
    if (!entryForm.description || !amount) {
      setError(t('errNeedDescAmount'));
      return;
    }
    setBusy(true);
    setError('');
    const isTransfer = entryForm.transactionType === 'transfer';
    try {
      await api.post('/api/finance/ledger/entries', {
        date: new Date(entryForm.date).toISOString(),
        description: entryForm.description,
        amountSar: amount,
        transactionType: entryForm.transactionType,
        referenceNumber: null,
        bankAccountId: entryForm.bankAccountId || null,
        counterpartyName: entryForm.counterpartyName || null,
        bankTransaction: isTransfer
          ? { transactionType: 'transfer', destinationAccountId: entryForm.destinationAccountId || null }
          : undefined,
      });
      setEntryForm({
        date: new Date().toISOString().slice(0, 10),
        transactionType: 'income', description: '', amountSar: '',
        bankAccountId: '', counterpartyName: '', destinationAccountId: '',
      });
      load();
    } catch (e: any) {
      setError(e?.message || t('errSaveEntry'));
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const isTransfer = entryForm.transactionType === 'transfer';

  return (
    <div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>📒</span> {t('ledgerHeader')}
        </h3>
        <div className="flex gap-2 items-center">
          <ExportButtons
            filename={t('fileNameLedger')}
            title={t('ledgerExportTitle')}
            subtitle={`${t('ledgerEntries')} (${data?.entries.length ?? 0}) · ${t('ledgerAccounts')} (${data?.accounts.length ?? 0})`}
            columns={[
              { header: t('date'), key: 'date' },
              { header: t('description'), key: 'description' },
              { header: t('type'), key: 'transactionType' },
              { header: t('amount'), key: 'amount' },
              { header: t('exportColAccount'), key: 'account' },
              { header: t('exportColParty'), key: 'counterparty' },
            ]}
            rows={(data?.entries ?? []).map(e => ({
              date: new Date(e.date).toLocaleDateString(),
              description: e.description,
              transactionType: typeLabel(e.transactionType),
              amount: `${fmtSar(e.amountSar)} ${t('sar')}`,
              account: e.bankAccountName ?? '-',
              counterparty: e.counterpartyName ?? '-',
            }))}
            sheets={[
              {
                name: t('ledgerEntries'),
                columns: [
                  { header: t('date'), key: 'date' },
                  { header: t('description'), key: 'description' },
                  { header: t('type'), key: 'transactionType' },
                  { header: t('amount'), key: 'amount' },
                  { header: t('exportColAccount'), key: 'account' },
                  { header: t('exportColParty'), key: 'counterparty' },
                ],
                rows: (data?.entries ?? []).map(e => ({
                  date: new Date(e.date).toLocaleDateString(),
                  description: e.description,
                  transactionType: typeLabel(e.transactionType),
                  amount: `${fmtSar(e.amountSar)} ${t('sar')}`,
                  account: e.bankAccountName ?? '-',
                  counterparty: e.counterpartyName ?? '-',
                })),
              },
              {
                name: t('ledgerAccounts'),
                columns: [
                  { header: t('exportColAccountName'), key: 'name' },
                  { header: t('exportColAccountNo'), key: 'number' },
                  { header: t('exportColBank'), key: 'bank' },
                  { header: t('exportColBalance'), key: 'balance' },
                ],
                rows: (data?.accounts ?? []).map(a => ({
                  name: a.accountName,
                  number: a.accountNumber,
                  bank: a.bankName,
                  balance: `${fmtSar(a.currentBalanceSar)} ${t('sar')}`,
                })),
              },
            ]}
          />
          <button onClick={load} className="text-[11px] text-emerald-300 border border-emerald-500/30 rounded px-2 py-1 hover:bg-emerald-500/10">
            {t('refresh')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {!data && !error && <div className="text-xs text-slate-400 py-4 text-center">{t('loadingLedger')}</div>}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-white">{s?.totalAccounts ?? 0}</div>
              <div className="text-[10px] text-slate-400">{t('bankAccountsLabel')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-emerald-300">{fmtSar(s?.totalBalanceSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('totalBalances')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-sky-300">{fmtSar(s?.totalCreditsSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('incomeCredits')}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
              <div className="text-lg font-black text-red-300">{fmtSar(s?.totalDebitsSar ?? 0)}</div>
              <div className="text-[10px] text-slate-400">{t('expensesDebits')}</div>
            </div>
          </div>

          {/* Bank accounts */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white">{t('bankAccountsHdr')}</h4>
              <button onClick={() => setShowAddAccount(v => !v)} className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 hover:bg-emerald-500/30">
                {showAddAccount ? t('close') : t('addGeneric')}
              </button>
            </div>

            {showAddAccount && (
              <form onSubmit={addAccount} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <input value={accForm.accountName} onChange={e => setAccForm({ ...accForm, accountName: e.target.value })} placeholder={t('accountNameReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
                <input value={accForm.accountNumber} onChange={e => setAccForm({ ...accForm, accountNumber: e.target.value })} placeholder={t('accountNoReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
                <input value={accForm.bankName} onChange={e => setAccForm({ ...accForm, bankName: e.target.value })} placeholder={t('bankNameReq')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
                <input value={accForm.branch} onChange={e => setAccForm({ ...accForm, branch: e.target.value })} placeholder={t('branch')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <input value={accForm.initialBalanceSar} onChange={e => setAccForm({ ...accForm, initialBalanceSar: e.target.value })} placeholder={t('openingBalance')} type="number" className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
                <button type="submit" disabled={busy} className="col-span-2 md:col-span-5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveAccount')}</button>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.accounts.map(a => (
                <div key={a.id} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="text-xs font-bold text-white">{a.accountName}</div>
                    <div className={`text-xs font-black ${a.currentBalanceSar >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmtSar(a.currentBalanceSar)} {t('sar')}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{a.bankName}{a.branch ? ' · ' + a.branch : ''}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5" dir="ltr">{a.accountNumber}</div>
                </div>
              ))}
              {data.accounts.length === 0 && <div className="text-xs text-slate-500 col-span-full text-center py-3">{t('noAccountsYet')}</div>}
            </div>
          </div>

          {/* New ledger entry */}
          <div className="mb-4">
            <h4 className="text-xs font-bold text-white mb-2">{t('newEntry')}</h4>
            <form onSubmit={addEntry} className="grid grid-cols-2 md:grid-cols-7 gap-2 bg-white/[0.03] border border-white/10 rounded-lg p-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('date')}</label>
                <input type="date" value={entryForm.date} onChange={e => setEntryForm({ ...entryForm, date: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('type')}</label>
                <select value={entryForm.transactionType} onChange={e => setEntryForm({ ...entryForm, transactionType: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                  {Object.keys(TYPE_LABEL).map(tp => <option key={tp} value={tp}>{typeLabel(tp)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('entryDescReq')}</label>
                <input value={entryForm.description} onChange={e => setEntryForm({ ...entryForm, description: e.target.value })} placeholder={t('entryDescPlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('amountSarReq')}</label>
                <input type="number" step="0.01" value={entryForm.amountSar} onChange={e => setEntryForm({ ...entryForm, amountSar: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('counterpartyLabel')}</label>
                <input value={entryForm.counterpartyName} onChange={e => setEntryForm({ ...entryForm, counterpartyName: e.target.value })} placeholder={t('counterpartyPlaceholder')} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">{t('bankAccountLabel')}</label>
                <select value={entryForm.bankAccountId} onChange={e => setEntryForm({ ...entryForm, bankAccountId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                  <option value="">{t('noAccount')}</option>
                  {data.accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                </select>
              </div>
              {isTransfer ? (
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">{t('destAccReq')}</label>
                  <select value={entryForm.destinationAccountId} onChange={e => setEntryForm({ ...entryForm, destinationAccountId: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required>
                    <option value="">{t('chooseDest')}</option>
                    {data.accounts.filter(a => a.id !== entryForm.bankAccountId).map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
                </div>
              ) : <div />}
              <button type="submit" disabled={busy} className="col-span-2 md:col-span-7 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs disabled:opacity-40">{t('saveEntry')}</button>
            </form>
          </div>

          {/* Ledger entries */}
          <div>
            <h4 className="text-xs font-bold text-white mb-2">📄 {t('ledgerEntries')} ({data.entries.length})</h4>
            {data.entries.length === 0 ? (
              <div className="text-xs text-slate-500 text-center py-4">{t('noEntries')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
                    <tr>
                      <th className="p-2 text-right">{t('date')}</th>
                      <th className="p-2 text-right">{t('description')}</th>
                      <th className="p-2">{t('type')}</th>
                      <th className="p-2">{t('amountSar')}</th>
                      <th className="p-2">{t('exportColAccount')}</th>
                      <th className="p-2">{t('exportColParty')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map(e => (
                      <tr key={e.id} className="border-b border-white/10">
                        <td className="p-2 whitespace-nowrap">{new Date(e.date).toLocaleDateString()}</td>
                        <td className="p-2 font-semibold text-white">{e.description}</td>
                        <td className="p-2"><span className={`px-2 py-0.5 rounded font-bold text-[10px] ${TYPE_COLOR[e.transactionType]}`}>{typeLabel(e.transactionType)}</span></td>
                        <td className={`p-2 font-mono font-bold ${e.transactionType === 'income' || e.transactionType === 'sale' ? 'text-emerald-300' : 'text-red-300'}`}>{fmtSar(e.amountSar)}</td>
                        <td className="p-2 text-slate-400">{e.bankAccountName ?? '-'}</td>
                        <td className="p-2 text-slate-400">{e.counterpartyName ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
