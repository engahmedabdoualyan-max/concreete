/**
 * ============================================================
 *  FIMTO SOFT — Product price analysis (تحليل سعر المنتجات)
 * ============================================================
 *  Direct cost  = mix recipe × material prices (silos, editable)
 *  Indirect/m³  = monthly overhead pool ÷ produced m³
 *  Depreciation = straight-line over editable years
 *  Suggested    = (direct + indirect + depreciation) × margin
 *  Margin choices: 15% … 40%.
 */

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import ExportButtons from './ExportButtons';

const INDIRECT_CATS = ['maintenance', 'fuel', 'oil', 'utilities', 'rent', 'office', 'vehicle', 'other'];

const RECIPE_FIELDS: { key: string; cat: string; ar: string }[] = [
  { key: 'cementKgPerM3', cat: 'CEMENT', ar: 'أسمنت' },
  { key: 'sandKgPerM3', cat: 'SAND', ar: 'رمل' },
  { key: 'gravel10mmKgPerM3', cat: 'GRAVEL_10MM', ar: 'ركام 10مم' },
  { key: 'gravel20mmKgPerM3', cat: 'GRAVEL_20MM', ar: 'ركام 20مم' },
  { key: 'gravel40mmKgPerM3', cat: 'GRAVEL_40MM', ar: 'ركام 40مم' },
  { key: 'waterLitresPerM3', cat: 'WATER', ar: 'مياه' },
  { key: 'admixturePlasiticzerLPerM3', cat: 'ADMIXTURE_PLASTICIZER', ar: 'ملدن' },
  { key: 'admixtureRetarderLPerM3', cat: 'ADMIXTURE_RETARDER', ar: 'مؤخر' },
  { key: 'flyAshKgPerM3', cat: 'FLY_ASH', ar: 'رماد' },
  { key: 'silicaFumeKgPerM3', cat: 'SILICA_FUME', ar: 'ميكروسيليكا' },
];

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default function PriceAnalysis() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [mixes, setMixes] = useState<any[]>([]);
  const [silos, setSilos] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [payRuns, setPayRuns] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [margin, setMargin] = useState(25);
  const [years, setYears] = useState('10');
  const [monthM3, setMonthM3] = useState('');
  const [assetVal, setAssetVal] = useState('');
  const [withSalaries, setWithSalaries] = useState(true);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      try {
        const [y, m] = month.split('-').map(Number);
        const [mx, si, ex, pr, py, eq] = await Promise.all([
          api.get<any>('/api/mix-designs').catch(() => []),
          api.get<any>('/api/inventory').catch(() => ({ silos: [] })),
          api.get<any>(`/api/finance/expenses?year=${y}&month=${m}`).catch(() => ({ expenses: [] })),
          api.get<any>('/api/production/runs').catch(() => ({ runs: [] })),
          api.get<any>('/api/hr/payroll/runs').catch(() => ({ runs: [] })),
          api.get<any>('/api/equipment').catch(() => []),
        ]);
        if (!on) return;
        setMixes(Array.isArray(mx) ? mx : (mx?.designs ?? mx?.mixDesigns ?? []));
        const siloList = Array.isArray(si) ? si : (si?.silos ?? []);
        setSilos(siloList);
        setExpenses(Array.isArray((ex as any)?.expenses) ? (ex as any).expenses : []);
        setRuns(Array.isArray((pr as any)?.runs) ? (pr as any).runs : []);
        setPayRuns(Array.isArray((py as any)?.runs) ? (py as any).runs : []);
        setAssets(Array.isArray(eq) ? eq : ((eq as any)?.equipment ?? (eq as any)?.machines ?? []));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [month]);

  // material price SAR/tonne: silo price wins, manual override wins over everything
  const priceOf = (cat: string): number => {
    if (prices[cat] !== undefined && prices[cat] !== '') return Number(prices[cat]) || 0;
    const hit = silos.find((s: any) => (s.materialCategory ?? s.category) === cat && Number(s.costSarPerTonne ?? s.cost ?? 0) > 0);
    return hit ? Number(hit.costSarPerTonne ?? hit.cost) : 0;
  };

  const directOf = (mix: any): { cost: number; missing: string[] } => {
    let cost = 0;
    const missing: string[] = [];
    for (const f of RECIPE_FIELDS) {
      const qty = Number(mix?.[f.key]) || 0;
      if (qty <= 0) continue;
      const p = priceOf(f.cat);
      if (p <= 0) missing.push(f.ar);
      cost += (qty / 1000) * p;
    }
    return { cost, missing };
  };

  const pool = INDIRECT_CATS.reduce((s, c) => s + expenses.filter((x: any) => x.category === c).reduce((a: number, x: any) => a + (Number(x.amountSar) || 0) / 100, 0), 0);
  const salTotal = withSalaries
    ? payRuns.filter((r: any) => String(r.period ?? '').slice(0, 7) === month && ['APPROVED', 'PAID'].includes(String(r.status ?? '')))
      .reduce((s: number, r: any) => s + (Number(r.totalGrossSar) || 0) + (Number(r.totalEmployerGosiSar) || 0), 0)
    : 0;
  const volumeAuto = runs.filter((r: any) => String(r.producedAt ?? '').slice(0, 7) === month)
    .reduce((s: number, r: any) => s + (Number(r.volumeM3) || 0), 0);
  const volume = monthM3.trim() !== '' ? (Number(monthM3) || 0) : volumeAuto;
  const assetCostReg = assets.filter((a: any) => (a.costSar ?? a.cost) != null && Number(a.costSar ?? a.cost) > 0)
    .reduce((s: number, a: any) => s + Number(a.costSar ?? a.cost), 0);
  const assetCost = assetVal.trim() !== '' ? (Number(assetVal) || 0) : assetCostReg;
  const assetMissing = assets.filter((a: any) => !((a.costSar ?? a.cost) != null && Number(a.costSar ?? a.cost) > 0)).length;
  const depMonthly = assetCost / (Math.max(1, Number(years) || 10) * 12);
  const indirectM3 = volume > 0 ? (pool + salTotal) / volume : 0;
  const depM3 = volume > 0 ? depMonthly / volume : 0;

  const rows = mixes.map((mix: any) => {
    const { cost: direct, missing } = directOf(mix);
    const base = direct + indirectM3 + depM3;
    const suggested = base * (1 + margin / 100);
    return {
      code: mix.designCode ?? '', desc: mix.gradeDescription ?? '',
      direct, indirect: indirectM3, dep: depM3, base, suggested, missing: missing.join('، '),
    };
  });

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl mt-4">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <h3 className="text-lg font-black tracking-tight text-white">📊 تحليل سعر المنتجات</h3>
        <span className="text-[10px] text-slate-400">مباشرة (الخلطات × الأسعار) + غير مباشرة + إهلاك ← هامش الربح</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 my-3">
        <label className="text-xs text-slate-400 font-semibold">الشهر <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mr-1" /></label>
        <label className="text-xs text-slate-400 font-semibold">الهامش
          <select value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mr-1">
            {[15, 20, 25, 30, 35, 40].map((m) => <option key={m} value={m}>{m}%</option>)}
          </select></label>
        <label className="text-xs text-slate-400 font-semibold">عمر الأصول (سنة) <input value={years} inputMode="decimal" onChange={(e) => setYears(e.target.value)} className="w-16 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mr-1" /></label>
        <label className="text-xs text-slate-400 font-semibold">إنتاج الشهر (م³) <input value={monthM3} inputMode="decimal" placeholder={volumeAuto ? String(Math.round(volumeAuto)) : '0'} onChange={(e) => setMonthM3(e.target.value)} className="w-24 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mr-1" /></label>
        <label className="text-xs text-slate-400 font-semibold">قيمة الأصول (ر.س) <input value={assetVal} inputMode="decimal" placeholder={assetCostReg ? String(Math.round(assetCostReg)) : '0'} onChange={(e) => setAssetVal(e.target.value)} className="w-28 bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs mr-1" /></label>
        <label className="text-xs text-slate-400 font-semibold flex items-center gap-1"><input type="checkbox" checked={withSalaries} onChange={(e) => setWithSalaries(e.target.checked)} /> تضمين الرواتب</label>
        <ExportButtons
          filename={`price-analysis-${month}`}
          title={`تحليل السعر ${month}`}
          subtitle={`هامش ${margin}% · إنتاج ${fmt(volume)} م³`}
          columns={[
            { header: 'الخلطة', key: 'code' }, { header: 'مباشرة/م³', key: 'direct' },
            { header: 'غير مباشرة/م³', key: 'indirect' }, { header: 'إهلاك/م³', key: 'dep' },
            { header: 'التكلفة', key: 'base' }, { header: `مقترح ${margin}%`, key: 'suggested' },
          ]}
          rows={rows.map((r) => ({
            code: `${r.code} ${r.desc}`, direct: fmt(r.direct), indirect: fmt(r.indirect),
            dep: fmt(r.dep), base: fmt(r.base), suggested: fmt(r.suggested),
          }))}
        />
      </div>
      {loading && <p className="text-xs text-slate-500">⏳ …</p>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-center">
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2"><p className="text-[10px] text-slate-400">إنتاج الشهر (م³)</p><p className="text-base font-black text-white">{fmt(volume)}</p></div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2"><p className="text-[10px] text-slate-400">غير مباشرة</p><p className="text-base font-black text-amber-300">{fmt(pool + salTotal)}</p></div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2"><p className="text-[10px] text-slate-400">إهلاك شهري</p><p className="text-base font-black text-sky-300">{fmt(depMonthly)}</p></div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2"><p className="text-[10px] text-slate-400">غير مباشرة/م³</p><p className="text-base font-black text-amber-300">{volume ? fmt(indirectM3) : '—'}</p></div>
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-2"><p className="text-[10px] text-slate-400">إهلاك/م³</p><p className="text-base font-black text-sky-300">{volume ? fmt(depM3) : '—'}</p></div>
      </div>
      <div className="rounded-lg border border-white/10 p-3 mb-4">
        <p className="text-[11px] font-black text-slate-300 mb-2">💰 أسعار الخامات (ر.س/طن — من الصوامع، قابلة للتعديل)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {RECIPE_FIELDS.map((f) => (
            <label key={f.cat} className="text-[10px] text-slate-400 font-semibold">{f.ar} {priceOf(f.cat) <= 0 && <span className="text-red-400">⚠ بدون سعر</span>}
              <input value={prices[f.cat] ?? ''} inputMode="decimal" placeholder={String(priceOf(f.cat) || '')}
                onChange={(e) => setPrices((p) => ({ ...p, [f.cat]: e.target.value }))}
                className="mt-0.5 w-full bg-white/[0.04] border border-white/10 rounded px-2 py-1.5 text-white text-xs" />
            </label>
          ))}
        </div>
        {assetMissing > 0 && <p className="text-[10px] text-yellow-300 mt-2">⚠ {assetMissing} من الأصول بدون قيمة شراء — غير محسوبة في الإهلاك.</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-300">
          <thead className="bg-white/[0.04] text-slate-400 text-[10px]">
            <tr><th className="p-2 text-right">الخلطة</th><th className="p-2">مباشرة</th><th className="p-2">غير مباشرة</th><th className="p-2">إهلاك</th><th className="p-2">التكلفة</th><th className="p-2">مقترح {margin}%</th><th className="p-2">ملاحظات</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/10">
                <td className="p-2 font-bold text-white">{r.code}<span className="block text-[10px] font-normal text-slate-500">{r.desc}</span></td>
                <td className="p-2 font-mono">{fmt(r.direct)}</td>
                <td className="p-2 font-mono">{fmt(r.indirect)}</td>
                <td className="p-2 font-mono">{fmt(r.dep)}</td>
                <td className="p-2 font-mono font-black text-white">{fmt(r.base)}</td>
                <td className="p-2 font-mono font-black text-emerald-300">{fmt(r.suggested)}</td>
                <td className="p-2 text-[10px] text-yellow-300">{r.missing ? `بدون سعر: ${r.missing}` : ''}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && <tr><td colSpan={7} className="p-4 text-center text-slate-500">لا خلطات مسجلة.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
