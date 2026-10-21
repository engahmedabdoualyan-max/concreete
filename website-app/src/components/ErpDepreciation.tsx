/**
 * ============================================================
 *  FIMTO SOFT — ERP قسم «اهلاك معدات» (Finance)
 * ============================================================
 *  أصول (مركبات + معدات) بسعر شراء، عمر افتراضي، ومعدل إهلاك سنوي.
 *
 *  الهدف الاقتصادي: لما الأصل يوصل آخر عمره، يكون مع الشركة ثمن
 *  معدة جديدة بدله. لذلك القيد الشهري مقسوم قسمين:
 *    • إهلاك محاسبي  — يخفض القيمة الدفترية لحد قيمة الأصل بحالته
 *    • تخصيص تجديد   — يجمع ثمن المعدة الجديدة (مع التضخم)
 *
 *  «تشغيل إهلاك الشهر» يولّد قيداً دفترياً لكل أصل مرة واحدة فقط
 *  لكل شهر (idempotent) — عبر /api/finance/depreciation.
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
  assessmentValueSar: number;
  floorValueSar: number;
  usefulLifeYears: number | null;
  lifeSource: string | null;
  replacementCostEstSar: number;
  inflationRatePct: string;
  replacementSource: string | null;
  isActive: boolean;
  notes: string | null;
  monthlyDepSar: number;
  monthlyBookSar: number;
  monthlyFundSar: number;
  accumulatedSar: number;
  accumulatedBookSar: number;
  bookValueSar: number;
  replacementTargetSar: number;
  fundGapSar: number;
  monthsRemaining: number | null;
  postedInPeriod: boolean;
  postedAmountSar: number;
}

interface AssetOption {
  id: string;
  label: string;
  detail: string | null;
  suggestedLifeYears: number;
  suggestedRatePct: number;
  referenceYear: number | null;
  suggestedReplacementSar: number;
  suggestionSource: string | null;
}

interface DepPreset { key: string; labelAr: string; years: number; ratePct: number }

interface DepData {
  assets: DepAsset[];
  vehicleOptions: AssetOption[];
  equipmentOptions: AssetOption[];
  settings: { defaultInflationRatePct: string; defaultLifeYears: number };
  presets: DepPreset[];
  summary: {
    assetCount: number;
    activeCount: number;
    totalCostSar: number;
    totalAccumulatedSar: number;
    totalBookValueSar: number;
    monthlyTotalSar: number;
    monthlyBookTotalSar: number;
    monthlyFundTotalSar: number;
    postedThisPeriodSar: number;
    totalReplacementTargetSar: number;
    totalFundGapSar: number;
  };
}

const fmtSar = (n: number) => (Number(n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const pct = (raw: string | number) => Number(raw).toLocaleString('en-US', { maximumFractionDigits: 2 });
const toSar = (cents: number) => String(Number(cents || 0) / 100);
const toCents = (sar: string) => Math.round((Number(sar) || 0) * 100);

type LifeSource = 'manual' | 'type_default' | 'manufacture_year';

export default function ErpDepreciation() {
  const t = useErpDict();
  const [data, setData] = useState<DepData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [editFor, setEditFor] = useState<DepAsset | null>(null);
  const [settings, setSettings] = useState({ defaultInflationRatePct: '3', defaultLifeYears: '10' });

  const [form, setForm] = useState({
    source: 'vehicle' as 'vehicle' | 'equipment',
    vehicleId: '',
    equipmentId: '',
    purchaseCostSar: '',
    purchaseDate: '',
    annualRatePct: '10',
    usefulLifeYears: '',
    lifeSource: 'type_default' as LifeSource,
    replacementCostEstSar: '',
    inflationRatePct: '',
    assessmentValueSar: '',
    replacementSource: '' as string | null,
    notes: '',
  });

  const load = () => {
    setError('');
    api.get<DepData>(`/api/finance/depreciation?period=${period}-01`)
      .then((d) => {
        setData(d);
        setSettings({
          defaultInflationRatePct: String(Number(d.settings.defaultInflationRatePct)),
          defaultLifeYears: String(d.settings.defaultLifeYears),
        });
      })
      .catch((e: any) => setError(e?.message || t('errLoad')));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(load, []);

  // ── when the operator picks a vehicle/equipment, pre-fill the defaults ──
  const applyOption = (opt: AssetOption | undefined) => {
    if (!opt) return;
    setForm(f => ({
      ...f,
      annualRatePct: String(opt.suggestedRatePct),
      usefulLifeYears: String(opt.suggestedLifeYears),
      lifeSource: 'type_default',
      replacementCostEstSar: opt.suggestedReplacementSar ? toSar(opt.suggestedReplacementSar) : f.replacementCostEstSar,
      replacementSource: opt.suggestedReplacementSar ? opt.suggestionSource : null,
    }));
  };

  const startEdit = (a: DepAsset) => {
    setEditFor(a);
    setForm({
      source: a.source,
      vehicleId: a.vehicleId ?? '',
      equipmentId: a.equipmentId ?? '',
      purchaseCostSar: toSar(a.purchaseCostSar),
      purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '',
      annualRatePct: String(Number(a.annualRatePct)),
      usefulLifeYears: a.usefulLifeYears ? String(a.usefulLifeYears) : '',
      lifeSource: (a.lifeSource ?? 'manual') as LifeSource,
      replacementCostEstSar: a.replacementCostEstSar ? toSar(a.replacementCostEstSar) : '',
      inflationRatePct: a.inflationRatePct ? String(Number(a.inflationRatePct)) : '',
      assessmentValueSar: a.assessmentValueSar ? toSar(a.assessmentValueSar) : '',
      replacementSource: a.replacementSource,
      notes: a.notes ?? '',
    });
    setShowAdd(true);
  };

  const cancelEdit = () => {
    setEditFor(null);
    setForm({
      source: 'vehicle', vehicleId: '', equipmentId: '', purchaseCostSar: '', purchaseDate: '',
      annualRatePct: '10', usefulLifeYears: '', lifeSource: 'type_default',
      replacementCostEstSar: '', inflationRatePct: '', assessmentValueSar: '',
      replacementSource: null, notes: '',
    });
    setShowAdd(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const payload = {
      purchaseCostSar: toCents(form.purchaseCostSar),
      purchaseDate: form.purchaseDate || null,
      annualRatePct: Number(form.annualRatePct) || 0,
      usefulLifeYears: Number(form.usefulLifeYears) || null,
      lifeSource: form.lifeSource,
      replacementCostEstSar: toCents(form.replacementCostEstSar),
      inflationRatePct: form.inflationRatePct === '' ? (Number(settings.defaultInflationRatePct) || 0) : (Number(form.inflationRatePct) || 0),
      assessmentValueSar: toCents(form.assessmentValueSar),
      replacementSource: form.replacementSource,
      notes: form.notes || null,
    };
    try {
      if (editFor) {
        await api.put(`/api/finance/depreciation/${editFor.id}`, payload);
      } else {
        await api.post('/api/finance/depreciation', {
          ...payload,
          source: form.source,
          vehicleId: form.source === 'vehicle' ? form.vehicleId : null,
          equipmentId: form.source === 'equipment' ? form.equipmentId : null,
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
      const res = await api.post<{
        created: number; skippedExisting: number; totalPostedSar: number;
        periodMonth: string; catchUpMonths: number; totalBookSar: number; totalFundSar: number;
      }>('/api/finance/depreciation/run', { period: `${period}-01` });
      setNotice(
        `${t('depRunDone')} — ${res.periodMonth}: ${res.created} ✅ · ${res.skippedExisting} ⏭ · ` +
        `${fmtSar(res.totalPostedSar)} ${t('sar')}` +
        (res.catchUpMonths > 1 ? ` (${res.catchUpMonths} ${t('depCatchUp')})` : '')
      );
      load();
    } catch (err: any) {
      setError(err?.message || t('errRun'));
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.put('/api/finance/depreciation/settings', {
        defaultInflationRatePct: Number(settings.defaultInflationRatePct) || 0,
        defaultLifeYears: Number(settings.defaultLifeYears) || 10,
      });
      setNotice(t('depRunDone'));
      load();
    } catch (err: any) {
      setError(err?.message || t('errSave'));
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  const selectedOption = form.source === 'vehicle'
    ? (data?.vehicleOptions ?? []).find((v) => v.id === form.vehicleId)
    : (data?.equipmentOptions ?? []).find((v) => v.id === form.equipmentId);

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
              { header: t('depLife'), key: 'life' },
              { header: t('depRate'), key: 'rate' },
              { header: t('depMonthly'), key: 'monthly' },
              { header: t('depAccumulated'), key: 'accumulated' },
              { header: t('depBookValue'), key: 'book' },
              { header: t('depTarget'), key: 'target' },
              { header: t('depFundGap'), key: 'gap' },
            ]}
            rows={(data?.assets ?? []).map(a => ({
              asset: a.assetLabel,
              source: a.source === 'vehicle' ? t('depVehicle') : t('depEquipment'),
              cost: `${fmtSar(a.purchaseCostSar)} ${t('sar')}`,
              life: a.usefulLifeYears ? `${a.usefulLifeYears} ${t('depLife')}` : '—',
              rate: `${pct(a.annualRatePct)}%`,
              monthly: `${fmtSar(a.monthlyDepSar)} ${t('sar')}`,
              accumulated: `${fmtSar(a.accumulatedSar)} ${t('sar')}`,
              book: `${fmtSar(a.bookValueSar)} ${t('sar')}`,
              target: `${fmtSar(a.replacementTargetSar)} ${t('sar')}`,
              gap: `${fmtSar(a.fundGapSar)} ${t('sar')}`,
            }))}
          />
          <button onClick={() => setShowSettings(v => !v)}
            className="text-[11px] bg-white/[0.06] border border-white/15 text-slate-200 rounded px-2 py-1 hover:bg-white/10">
            {t('depSettings')}
          </button>
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

      {showSettings && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-3 items-end">
          <label className="text-[10px] text-slate-400">
            {t('depDefaultInflation')}
            <input type="number" step="0.01" min="0" max="100" value={settings.defaultInflationRatePct}
              onChange={e => setSettings({ ...settings, defaultInflationRatePct: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mt-1" />
          </label>
          <label className="text-[10px] text-slate-400">
            {t('depDefaultLife')}
            <input type="number" step="1" min="1" max="60" value={settings.defaultLifeYears}
              onChange={e => setSettings({ ...settings, defaultLifeYears: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mt-1" />
          </label>
          <button onClick={saveSettings} disabled={busy}
            className="text-[11px] bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 rounded px-2 py-1.5 hover:bg-emerald-500/30 disabled:opacity-40">
            {t('depSaveSettings')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-white">{s?.activeCount ?? 0}<span className="text-slate-500 text-xs">/{s?.assetCount ?? 0}</span></div>
          <div className="text-[10px] text-slate-400">{t('depAsset')}</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-violet-200">{fmtSar(s?.monthlyTotalSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryMonthly')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-sky-200">{fmtSar(s?.monthlyBookTotalSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depBookPart')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-teal-200">{fmtSar(s?.monthlyFundTotalSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryFund')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-amber-200">{fmtSar(s?.totalReplacementTargetSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryTarget')} ({t('sar')})</div>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2 text-center">
          <div className="text-lg font-black text-rose-200">{fmtSar(s?.totalFundGapSar ?? 0)}</div>
          <div className="text-[10px] text-slate-400">{t('depSummaryGap')} ({t('sar')})</div>
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
                <select value={form.vehicleId}
                  onChange={e => {
                    const opt = (data?.vehicleOptions ?? []).find((v) => v.id === e.target.value);
                    setForm({ ...form, vehicleId: e.target.value });
                    applyOption(opt);
                  }}
                  className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" required>
                  <option value="">{t('depVehicle')}</option>
                  {(data?.vehicleOptions ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.label}{v.detail ? ` — ${v.detail}` : ''}</option>
                  ))}
                </select>
              ) : (
                <select value={form.equipmentId}
                  onChange={e => {
                    const opt = (data?.equipmentOptions ?? []).find((v) => v.id === e.target.value);
                    setForm({ ...form, equipmentId: e.target.value });
                    applyOption(opt);
                  }}
                  className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2" required>
                  <option value="">{t('depEquipment')}</option>
                  {(data?.equipmentOptions ?? []).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              )}
            </>
          )}
          <input type="number" step="0.01" min="0.01" value={form.purchaseCostSar} onChange={e => setForm({ ...form, purchaseCostSar: e.target.value })}
            placeholder={t('depCost')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <input type="date" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />

          {/* ── العمر الافتراضي ── */}
          <select value={form.lifeSource} onChange={e => setForm({ ...form, lifeSource: e.target.value as LifeSource })}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs">
            <option value="type_default">{t('depLifeTypeDefault')}</option>
            <option value="manual">{t('depLifeManual')}</option>
            <option value="manufacture_year">{t('depLifeManufacture')}</option>
          </select>
          <input type="number" step="1" min="1" max="60" value={form.usefulLifeYears}
            onChange={e => setForm({ ...form, usefulLifeYears: e.target.value })}
            placeholder={t('depLife')}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
          <input type="number" step="0.01" min="0.01" max="100" value={form.annualRatePct}
            onChange={e => setForm({ ...form, annualRatePct: e.target.value })}
            placeholder={t('depRate')}
            className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" required />
          <label className="text-[10px] text-slate-400">
            {t('depInflation')}
            <input type="number" step="0.01" min="0" max="100" value={form.inflationRatePct}
              onChange={e => setForm({ ...form, inflationRatePct: e.target.value })}
              placeholder={String(Number(settings.defaultInflationRatePct))}
              className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mt-1" />
          </label>

          {/* ── صندوق تجديد الأصول ── */}
          <label className="text-[10px] text-slate-400 col-span-2" title={t('depReplacementHint')}>
            {t('depReplacement')}
            <div className="flex gap-1 mt-1">
              <input type="number" step="0.01" min="0" value={form.replacementCostEstSar}
                onChange={e => setForm({ ...form, replacementCostEstSar: e.target.value })}
                placeholder="0.00"
                className="flex-1 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
              {selectedOption && selectedOption.suggestedReplacementSar > 0 && (
                <button type="button" onClick={() => setForm({ ...form, replacementCostEstSar: toSar(selectedOption.suggestedReplacementSar), replacementSource: selectedOption.suggestionSource })}
                  title={t('depReplacementSource')}
                  className="text-[10px] px-2 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 whitespace-nowrap">
                  {t('depUseSuggestion')}
                </button>
              )}
            </div>
          </label>
          <label className="text-[10px] text-slate-400 col-span-2">
            {t('depAssessment')}
            <input type="number" step="0.01" min="0" value={form.assessmentValueSar}
              onChange={e => setForm({ ...form, assessmentValueSar: e.target.value })}
              placeholder="0.00"
              className="w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mt-1" />
          </label>
          <div className="col-span-2 md:col-span-4 text-[10px] text-amber-200/80 bg-amber-500/5 border border-amber-500/20 rounded p-2">
            💡 {t('depTargetHint')}
          </div>

          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            placeholder={t('description')} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs col-span-2 md:col-span-3" />
          <div className="col-span-2 md:col-span-1 flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 bg-violet-500 hover:bg-violet-600 text-white font-bold py-1.5 rounded-lg text-xs disabled:opacity-40">{t('saveChanges')}</button>
            <button type="button" onClick={cancelEdit} className="bg-white/[0.06] border border-white/15 text-slate-300 font-bold py-1.5 rounded-lg text-xs px-3">{t('cancel')}</button>
          </div>

          {selectedOption && (
            <div className="col-span-2 md:col-span-4 text-[10px] text-amber-200/90 bg-amber-500/5 border border-amber-500/20 rounded p-2">
              ⚡ {t('depPreset')}: <b>{selectedOption.suggestedLifeYears}</b> {t('depLife')} · {selectedOption.suggestedRatePct}% ({t('depRateAuto')})
              {selectedOption.referenceYear ? ` · ${t('depLifeManufacture')}: ${selectedOption.referenceYear}` : ''}
            </div>
          )}
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
                <th className="text-right px-2 py-2 font-black">{t('depLife')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depMonthly')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depAccumulated')}</th>
                <th className="text-right px-2 py-2 font-black">{t('depBookValue')}</th>
                <th className="text-right px-2 py-2 font-black" title={t('depTargetHint')}>{t('depTarget')}</th>
                <th className="text-right px-2 py-2 font-black">{t('status')}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.assets ?? []).map(a => {
                const fully = a.bookValueSar <= a.floorValueSar && a.monthlyDepSar === 0;
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
                    <td className="px-2 py-1.5 text-slate-300">
                      {fmtSar(a.purchaseCostSar)}
                      {a.assessmentValueSar > 0 && (
                        <div className="text-[10px] text-slate-500">≈ {fmtSar(a.assessmentValueSar)}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-violet-200 font-bold">
                      {a.usefulLifeYears ?? '—'}
                      <span className="text-[10px] text-slate-500"> · {pct(a.annualRatePct)}%</span>
                      {a.monthsRemaining !== null && (
                        <div className="text-[10px] text-slate-500">{a.monthsRemaining} {t('depMonthsLeft')}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-black text-amber-200">
                      {fmtSar(a.monthlyDepSar)}
                      {a.monthlyFundSar > 0 && (
                        <div className="text-[10px] font-normal text-teal-300">
                          {fmtSar(a.monthlyBookSar)} + {fmtSar(a.monthlyFundSar)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-slate-300">{fmtSar(a.accumulatedSar)}</td>
                    <td className="px-2 py-1.5 font-bold text-emerald-300">{fmtSar(a.bookValueSar)}</td>
                    <td className="px-2 py-1.5">
                      {a.replacementTargetSar > 0 ? (
                        <>
                          <div className="font-bold text-amber-200">{fmtSar(a.replacementTargetSar)}</div>
                          <div className="text-[10px] text-rose-300">− {fmtSar(a.fundGapSar)}</div>
                        </>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
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

      <p className="text-[10px] text-slate-500 mt-2">{t('depMethodHint')} {t('depMethodHint2')} {t('depRunHint')}</p>
    </div>
  );
}
