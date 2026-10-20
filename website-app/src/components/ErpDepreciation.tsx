/**
 * ============================================================
 *  FIMTO SOFT — ERP قسم «اهلاك معدات» (Finance)
 * ============================================================
 *  أصول (مركبات + معدات) بسعر شراء ومعدل إهلاك سنوي (خطي).
 *  زرار «تشغيل إهلاك الشهر» يولّد قيداً دفترياً لكل أصل مرة واحدة
 *  فقط لكل شهر (idempotent) — عبر /api/finance/depreciation.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';
import { useErpDict } from '../i18n/erpDict';

interface DepAsset {
  id: string;
  source: 'vehicle' | 'equipment';
  vehicleId: string | null;
  equipmentId: string | null;
  assetLabel: string;
  detail: string | null;
  purchaseCostSar: number;
  purchaseDate: string | null;
  annualRatePct: string;
  salvageValueSar: number;
  isActive: boolean;
  notes: string | null;
  monthlyDepSar: number;
  accumulatedSar: number;
  bookValueSar: number;
  postedInPeriod: boolean;
  postedAmountSar: number;
}

interface AssetOption { id: string; label: string; detail: string | null }

interface DepData {
  assets: DepAsset[];
  vehicleOptions: AssetOption[];
  equipmentOptions: AssetOption[];
  summary: {
    assetCount: number;
    activeCount: number;
    totalCostSar: number;
    totalAccumulatedSar: number;
    totalBookValueSar: number;
    monthlyTotalSar: number;
    postedThisPeriodSar: number;
  };
}

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (raw: string) => Number(raw).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function ErpDepreciation() {
  const t = useErpDict();
  const [data, setData] = useState<DepData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [editFor, setEditFor] = useState<DepAsset | null>(null);
  const [form, setForm] = useState({
    source: 'vehicle' as 'vehicle' | 'equipment',
    vehicleId: '',
    equipmentId: '',
    purchaseCostSar: '',
    purchaseDate: '',
    annualRatePct: '25',
    salvageValueSar: '',
    notes: '',
  });

  const load = () => {
    setError('');
    api.get<DepData>(`/api/finance/depreciation?period=${period}-01`)
      .then(setData)
      .catch((e: any) => setError(e?.message || t('errLoad')));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(load, []);

  const startEdit = (a: DepAsset) => {
    setEditFor(a);
    setForm({
      source: a.source,
      vehicleId: a.vehicleId ?? '',
      equipmentId: a.equipmentId ?? '',
      purchaseCostSar: String(a.purchaseCostSar / 100),
      purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '',
      annualRatePct: String(Number(a.annualRatePct)),
      salvageValueSar: a.salvageValueSar ? String(a.salvageValueSar / 100) : '',
      notes: a.notes ?? '',
    });
    setShowAdd(true);
  };

  const cancelEdit = () => {
    setEditFor(null);
    setForm({ source: 'vehicle', vehicleId: '', equipmentId: '', purchaseCostSar: '', purchaseDate: '', annualRatePct: '25', salvageValueSar: '', notes: '' });
    setShowAdd(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (editFor) {
        await api.put(`/api/finance/depreciation/${editFor.id}`, {
          purchaseCostSar: Math.round((Number(form.purchaseCostSar) || 0) * 100),
          purchaseDate: form.purchaseDate || null,
          annualRatePct: Number(form.annualRatePct) || 0,
          salvageValueSar: Math.round((Number(form.salvageValueSar) || 0) * 100),
          notes: form.notes || null,
        });
      } else {
        await api.post('/api/finance/depreciation', {
          source: form.source,
          vehicleId: form.source === 'vehicle' ? form.vehicleId : null,
          equipmentId: form.source === 'equipment' ? form.equipmentId : null,
          purchaseCostSar: Math.round((Number(form.purchaseCostSar) || 0) * 100),
          purchaseDate: form.purchaseDate || null,
          annualRatePct: Number(form.annualRatePct) || 0,
          salvageValueSar: Math.round((Number(form.salvageValueSar) || 0) * 100),
          notes: form.notes || null,
        });
      }
      cancelEdit();
      load();
    } catch (err: any) {
      setError(err?.message || t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (a: DepAsset) => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/api/finance/depreciation/${a.id}`, { isActive: !a.isActive });
      load();
    } catch (err: any) {
      setError(err?.message || t('errUpdate'));
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async (a: DepAsset) => {
    if (!window.confirm(`${t('depDeleteAsset')} — ${a.assetLabel}؟`)) return;
    setBusy(true);
    setError('');
    try {
      await api.del(`/api/finance/depreciation/${a.id}`);
      load();
    } catch (err: any) {
      setError(err?.message || t('errDelete'));
    } finally {
      setBusy(false);
    }
  };

  const runMonth = async () => {
    if (!window.confirm(`${t('depRun')} — ${period}؟`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post<{ created: number; skippedExisting: number; totalPostedSar: number; periodMonth: string }>(
        '/api/finance/depreciation/run',
        { period: `${period}-01` },
      );
      setNotice(`${t('depRunDone')} — ${res.periodMonth}: ${res.created} ✅ · ${res.skippedExisting} ⏭ · ${fmtSar(res.totalPostedSar)} ${t('sar')}`);
      load();
    } catch (err: any) {
      setError(err?.message || t('errRun'));
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;

  return (
    <div className="bg-white/[0.02] border border-violet-500/20 rounded-xl p-4 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>📉</span> {t('depTitle')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1 text-white text-[11px]" />
          <ExportButtons
            filename={t('fileNameDep')}
            title={`${t('depExportTitle')} (${period})`}
            columns={[
              { header: t('depAsset'), key: 'asset' },
              { header: t('depSource'), key: 'source' },
              { header: t('depCost'), key: 'cost' },
              { header: t('depRate'), key: 'rate' },
              { header: t('depMonthly'), key: 'monthly' },
              { header: t('depAccumulated'), key: 'accumulated' },
              { header: t('depBookValue'), key: 'book' },
            ]}
            rows={(data?.assets ?? []).map(a => ({
              asset: a.assetLabel,
              source: a.source === 'vehicle' ? t('depVehicle') : t('depEquipment'),
              cost: `${fmtSar(a.purchaseCostSar)} ${t('sar')}`,
              rate: `${pct(a.annualRatePct)}%`,
              monthly: `${fmtSar(a.monthlyDepSar)} ${t('sar')}`,
              accumulated: `${fmtSar(a.accumulatedSar)} ${t('sar')}`,
              book: `${fmtSar(a.bookValueSar)} ${t('sar')}`,
            }))}
          />
          <button onClick={runMonth} disabled={busy || !(s?.activeCount ?? 0)}
            className="text-[11px] bg-violet-500/20 text-violet-200 border border-violet-500/40 rounded px-2 py-1 hover:bg-violet-500/30 disabled:opacity-40">
            {t('depRun')}
          </button>
          <button onClick={() => (showAdd ? cancelEdit() : setShowAdd(true))}
            className="text-[11px] bg-violet-500/20 text-violet-200 border border-violet-500/40 rounded px-2 py-1 hover:bg-violet-500/30">
            {showAdd ? t('close') : t('depAdd')}
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}
      {notice && <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 mb-3">{notice}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{s?.activeCount ?? 0}<span className="text-slate-500 text-xs">/{s?.assetCount ?? 0}</span></div>
          <div className="text-[10px] text-slate-400">{t('depAsset')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-violet-200">{fmtSar(s?.monthlyTotalSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryMonthly')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-amber-200">{fmtSar(s?.totalAccumulatedSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryAccum')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-emerald-300">{fmtSar(s?.totalBookValueSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryBook')} ({t('sar')})</div>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={save} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-violet-500/5 border border-violet-500/20 rounded-lg p-3">
          <div className="col-span-2 md:col-span-4 text-[11px] font-black text-violet-200">
            {editFor ? `✏️ ${editFor.assetLabel}` : `➕ ${t('depAdd')}`}
          </div>
          {!editFor && (
            <>
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value as 'vehicle' | 'equipment' })}
                className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
                <option value="vehicle">🚛 {t('depVehicle')}</option>
                <option value="equipment">🛠 {t('depEquipment')}</option>
              </select>
              {form.source === 'vehicle' ? (
                <select value={form.vehicleId} onChange={e => setForm({ ...form, vehicleId: e.target.value })}
                  className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" required>
                  <option value="">{t('depVehicle')}</option>
                  {(data?.vehicleOptions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}{v.detail ? ` — ${v.detail}` : ''}</option>
                  ))}
                </select>
              ) : (
                <select value={form.equipmentId} onChange={e => setForm({ ...form, equipmentId: e.target.value })}
                  className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" required>
                  <option value="">{t('depEquipment')}</option>
                  {(data?.equipmentOptions ?? []).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              )}
            </>
          )}
          <input type="number" step="0.01" min="0.01" value={form.purchaseCostSar} onChange={e => setForm({ ...form, purchaseCostSar: e.target.value })}
            placeholder={t('depCost')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="number" step="0.01" min="0.01" max="100" value={form.annualRatePct} onChange={e => setForm({ ...form, annualRatePct: e.target.value })}
            placeholder={t('depRate')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <input type="number" step="0.01" min="0" value={form.salvageValueSar} onChange={e => setForm({ ...form, salvageValueSar: e.target.value })}
            placeholder={t('depSalvage')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder={t('description')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2 md:col-span-3" />
          <div className="col-span-2 md:col-span-1 flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 bg-violet-500 hover:bg-violet-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveChanges')}</button>
            <button type="button" onClick={cancelEdit} className="bg-white/[0.06] border border-white/15 text-slate-300 font-bold py-1.5 rounded-lg text-xs px-3">{t('cancel')}</button>
          </div>
        </form>
      )}

      {(data?.assets ?? []).length === 0 ? (
        <div className="text-xs text-slate-500 text-center py-6">{t('depNoAssets')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-right px-2 py-2 font-black">{t('depAsset')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depCost')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depRate')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depMonthly')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depAccumulated')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depBookValue')}</th>
                <th className="text-right px-2 py-2 font-black">{t('status')}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.assets ?? []).map(a => {
                const fully = a.bookValueSar <= a.salvageValueSar && a.monthlyDepSar === 0;
                return (
                  <tr key={a.id} className={`border-b border-white/5 ${a.isActive ? '' : 'opacity-50'}`}>
                    <td className="px-2 py-1.5">
                      <div className="font-bold text-white">{a.assetLabel}</div>
                      <div className="text-[10px] text-slate-500">
                        {a.source === 'vehicle' ? '🚛' : '🛠'} {t(a.source === 'vehicle' ? 'depVehicle' : 'depEquipment')}
                        {a.detail ? ` · ${a.detail}` : ''}
                        {a.purchaseDate ? ` · ${new Date(`${a.purchaseDate.slice(0, 10)}T00:00:00`).toLocaleDateString()}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-slate-300">{fmtSar(a.purchaseCostSar)}</td>
                    <td className="px-2 py-1.5 text-violet-200 font-bold">{pct(a.annualRatePct)}%</td>
                    <td className="px-2 py-1.5 font-black text-amber-200">{fmtSar(a.monthlyDepSar)}</td>
                    <td className="px-2 py-1.5 text-slate-300">{fmtSar(a.accumulatedSar)}</td>
                    <td className="px-2 py-1.5 font-bold text-emerald-300">{fmtSar(a.bookValueSar)}</td>
                    <td className="px-2 py-1.5">
                      {a.postedInPeriod
                        ? <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">{t('depPosted')} {fmtSar(a.postedAmountSar)}</span>
                        : fully
                          ? <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-slate-400">{t('depFully')}</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400">{t('depNotPosted')}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(a)} title={t('editSupplier')} className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-slate-300 hover:text-white mr-1">✏️</button>
                      <button onClick={() => toggleActive(a)} disabled={busy} className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 ${a.isActive ? 'border-amber-500/40 text-amber-300' : 'border-emerald-500/40 text-emerald-300'}`}>
                        {a.isActive ? t('depToggleOff') : t('depToggleOn')}
                      </button>
                      <button onClick={() => removeAsset(a)} disabled={busy} title={t('depDeleteAsset')} className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 text-red-300 hover:bg-red-500/10">🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500 mt-2">{t('depMethodHint')} {t('depRunHint')}</p>
    </div>
  );
}
