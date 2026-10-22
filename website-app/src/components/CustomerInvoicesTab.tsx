import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFinanceDict } from '../i18n/financeDict';

export function CustomerInvoicesTab() {
  const t = useFinanceDict();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showZatcaModal, setShowZatcaModal] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get<any>('/api/finance/customer-invoices');
      setInvoices(res?.invoices ?? []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">✅ Paid</span>;
      case 'PARTIAL': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300">◐ Partial</span>;
      case 'CANCELLED': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300">❌ Cancelled</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300">⏳ Open</span>;
    }
  };

  const handleIssueZatca = async (invoice: any) => {
    try {
      const res = await api.post<{ success: boolean; message?: string }>(`/api/finance/customer-invoices/${invoice.id}?action=zatca-issue`, {});
      if (res.success) {
        alert('✅ تم إصدار الفاتورة الإلكترونية بنجاح');
        loadInvoices();
      } else {
        throw new Error(res.message || 'Failed to issue ZATCA invoice');
      }
    } catch (e: any) {
      alert('❌ فشل إصدار الفاتورة: ' + (e?.message || 'Failed to issue ZATCA invoice'));
    }
  };

  const handleRecordPayment = async (invoice: any) => {
    const amount = prompt(`أدخل مبلغ السداد بالريال (المتبقي: ${(Number(invoice.totalAmountSar) - Number(invoice.paidAmountSar)) / 100} ريال):`);
    if (!amount || isNaN(Number(amount))) return;

    const amountMinor = Math.round(Number(amount) * 100);
    const remaining = (Number(invoice.totalAmountSar) - Number(invoice.paidAmountSar));
    if (amountMinor > remaining) {
      alert(`المبلغ يتجاوز المتبقي! المتبقي: ${remaining / 100} ريال`);
      return;
    }

    try {
      await api.post(`/api/finance/customer-invoices/${invoice.id}?action=pay`, {
        amountSar: Number(amount),
        paymentMode: 'BANK',
        paymentDate: new Date().toISOString().split('T')[0],
      });
      alert('✅ تم تسجيل السداد بنجاح');
      loadInvoices();
    } catch (e: any) {
      alert('❌ فشل تسجيل السداد: ' + (e?.message || 'Unknown error'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-lg font-bold text-white">{t('customerInvoices') || 'فواتير العملاء'}</h3>
        <div className="flex gap-2">
          <button
            onClick={() => loadInvoices()}
            disabled={loading}
            className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
          >
            🔄 {t('refresh') || 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}

      {/* ZATCA Settings Button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowZatcaModal(true)}
          className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
        >
          ⚙️ {t('zatcaSettings') || 'ZATCA Settings'}
        </button>
      </div>

      {loading && <div className="text-xs text-slate-400 text-center py-8">Loading invoices…</div>}

      {!loading && invoices.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          <p className="text-sm font-bold mb-2">{t('noInvoices') || 'لا توجد فواتير'}</p>
          <p className="text-xs text-slate-400">{t('noInvoicesHint') || 'لا توجد فواتير لهذا التاريخ'}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-300">
          <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
            <tr>
              <th className="p-2 text-right">{t('thInvoiceNo') || 'Invoice No.'}</th>
              <th className="p-2 text-right">{t('thDate') || 'Date'}</th>
              <th className="p-2 text-right">{t('thCustomer') || 'Customer'}</th>
              <th className="p-2">{t('thAmount') || 'Amount'}</th>
              <th className="p-2">{t('thStatus') || 'Status'}</th>
              <th className="p-2">{t('thDueDate') || 'Due Date'}</th>
              <th className="p-2 text-right">{t('thActions') || 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <tr key={inv.id} className="border-b border-white/10">
                <td className="p-2 font-mono" dir="ltr">{inv.invoiceNumber}</td>
                <td className="p-2">{inv.invoiceDate?.split('T')[0]}</td>
                <td className="p-2">
                  <div className="font-bold text-white">{inv.client?.companyName || '—'}</div>
                  <div className="text-[10px] text-slate-400">{inv.client?.clientCode}</div>
                </td>
                <td className="p-2 font-mono text-white">{Number(inv.totalAmountSar / 100).toLocaleString()} SAR</td>
                <td className="p-2">{getStatusBadge(inv.status)}</td>
                <td className="p-2 text-[10px] text-slate-400">{inv.dueDate?.split('T')[0] || '-'}</td>
                <td className="p-2 flex gap-1 justify-end">
                  <button
                    onClick={() => handleRecordPayment(inv)}
                    disabled={inv.status === 'PAID' || inv.status === 'CANCELLED'}
                    className="text-[10px] font-black rounded-lg px-2 py-1 border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 disabled:opacity-50"
                  >
                    💰 {t('recordPayment') || 'Record Payment'}
                  </button>
                  <button
                    onClick={() => handleIssueZatca(inv)}
                    disabled={inv.status !== 'OPEN' && inv.status !== 'PARTIAL'}
                    className="text-[10px] font-black rounded-lg px-2 py-1 border border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 disabled:opacity-50"
                  >
                    🧾 {t('issueZatca') || 'Issue ZATCA'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ZATCA Settings Modal */}
      {showZatcaModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowZatcaModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-white">⚙️ {t('zatcaSettings') || 'ZATCA Settings'}</h3>
              <button onClick={() => setShowZatcaModal(false)} className="text-[11px] border border-white/15 rounded px-2 py-0.5 text-slate-300 hover:text-white">
                ✕ {t('close') || 'Close'}
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-400 text-center py-8">ZATCA Settings panel - configure seller name, VAT number, environment, certificates</p>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowZatcaModal(false)} className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-white/10 bg-white/[0.04] text-slate-300 hover:border-sky-400/50">
                  {t('close') || 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}