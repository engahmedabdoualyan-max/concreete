import fs from 'fs';

const filePath = '/home/dr-ahmed/.local/share/opencode/worktree/cac13e/playful-lagoon/website-app/src/pages/ErpMaterials.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add state variables after stockResult
content = content.replace(
  'const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);',
  'const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);\n  const [plants, setPlants] = useState<{ id: string; plantCode: string; plantName: string; plantType: string; siteId: string; siteName: string; siteCode: string; siloCount: number }[]>([]);\n  const [sites, setSites] = useState<{ id: string; siteCode: string; siteName: string }[]>([]);\n  const [plantFilter, setPlantFilter] = useState<string>(\'ALL\');\n  const [siteFilter, setSiteFilter] = useState<string>(\'ALL\');'
);

// 2. Update loadAll to fetch plants
content = content.replace(
  'const loadAll = () => {\n    setError(\'\');\n    api.get<InventoryData>(\'/api/inventory\').then(setInv).catch((e: any) => setError(e?.message || t(\'loadInvError\')));\n    api.get<PRData>(\'/api/inventory/purchase-requests\').then(setPrData).catch((e: any) => setError(e?.message || t(\'loadPrError\')));\n    api.get<MixDesign[]>(\'/api/mix-designs\').then(setMixes).catch((e: any) => setError(e?.message || t(\'loadMixError\')));\n  };',
  'const loadAll = () => {\n    setError(\'\');\n    api.get<InventoryData>(\'/api/inventory\').then(setInv).catch((e: any) => setError(e?.message || t(\'loadInvError\')));\n    api.get<PRData>(\'/api/inventory/purchase-requests\').then(setPrData).catch((e: any) => setError(e?.message || t(\'loadPrError\')));\n    api.get<MixDesign[]>(\'/api/mix-designs\').then(setMixes).catch((e: any) => setError(e?.message || t(\'loadMixError\')));\n    // Load plants and sites for filters\n    api.get(\'/api/inventory/plants\').then((res) => {\n      if (res?.plants) setPlants(res.plants);\n      if (res?.sites) setSites(res.sites);\n    }).catch(() => {});\n  };'
);

console.log('Part 1 done');

// 3. Update ExportButtons section - columns
content = content.replace(
  'columns={\n              tab === \'inv\'\n                ? [\n                    { header: t(\'expSilo\'), key: \'silo\' },\n                    { header: t(\'expCategory\'), key: \'cat\' },\n                    { header: t(\'expCurrentStock\'), key: \'stock\' },\n                    { header: t(\'expReorder\'), key: \'reorder\' },\n                    { header: t(\'expCapacity\'), key: \'cap\' },\n                    { header: t(\'expStatus\'), key: \'status\' },\n                  ]\n                : tab === \'pr\'\n                ? [\n                    { header: t(\'expPrNo\'), key: \'no\' },\n                    { header: t(\'expSilo\'), key: \'silo\' },\n                    { header: t(\'expPriority\'), key: \'prio\' },\n                    { header: t(\'expDate\'), key: \'date\' },\n                    { header: t(\'expStatus\'), key: \'status\' },\n                  ]\n                : [\n                    { header: t(\'expCode\'), key: \'code\' },\n                    { header: t(\'expName\'), key: \'name\' },\n                    { header: t(\'expCement\'), key: \'cement\' },\n                    { header: t(\'expSand\'), key: \'sand\' },\n                    { header: t(\'expGravel\'), key: \'gravel\' },\n                  ]\n            }',
  'columns={\n              tab === \'inv\'\n                ? [\n                    { header: t(\'expSilo\'), key: \'silo\' },\n                    { header: t(\'expCategory\'), key: \'cat\' },\n                    { header: t(\'expPlant\'), key: \'plant\' },\n                    { header: t(\'expSite\'), key: \'site\' },\n                    { header: t(\'expCurrentStock\'), key: \'stock\' },\n                    { header: t(\'expReorder\'), key: \'reorder\' },\n                    { header: t(\'expCapacity\'), key: \'cap\' },\n                    { header: t(\'expStatus\'), key: \'status\' },\n                  ]\n                : tab === \'pr\'\n                ? [\n                    { header: t(\'expPrNo\'), key: \'no\' },\n                    { header: t(\'expSilo\'), key: \'silo\' },\n                    { header: t(\'expPriority\'), key: \'prio\' },\n                    { header: t(\'expDate\'), key: \'date\' },\n                    { header: t(\'expStatus\'), key: \'status\' },\n                  ]\n                : [\n                    { header: t(\'expCode\'), key: \'code\' },\n                    { header: t(\'expName\'), key: \'name\' },\n                    { header: t(\'expCement\'), key: \'cement\' },\n                    { header: t(\'expSand\'), key: \'sand\' },\n                    { header: t(\'expGravel\'), key: \'gravel\' },\n                  ]\n            }'
);

console.log('Part 2 done');

// 4. Update rows
content = content.replace(
  'rows={\n              tab === \'inv\'\n                ? (inv?.silos ?? []).map(s => ({\n                    silo: `${s.siloName} (${s.siloCode})`,\n                    cat: t(CAT_LABEL[s.materialCategory] ?? s.materialCategory),\n                    stock: fmtKg(s.currentStockKg),\n                    reorder: fmtKg(s.reorderLevelKg),\n                    cap: fmtKg(s.capacityKg),\n                    status: s.currentStockKg <= s.reorderLevelKg ? t(\'low\') : t(\'good\'),\n                  }))',
  'rows={\n              tab === \'inv\'\n                ? (inv?.silos ?? []).map(s => ({\n                    silo: `${s.siloName} (${s.siloCode})`,\n                    cat: t(CAT_LABEL[s.materialCategory] ?? s.materialCategory),\n                    plant: s.plant?.plantName ?? \'-\',\n                    site: s.site?.siteName ?? \'-\',\n                    stock: fmtKg(s.currentStockKg),\n                    reorder: fmtKg(s.reorderLevelKg),\n                    cap: fmtKg(s.capacityKg),\n                    status: s.currentStockKg <= s.reorderLevelKg ? t(\'low\') : t(\'good\'),\n                  }))'
);

console.log('Part 3 done');

// 4. Add filter dropdowns after ExportButtons
content = content.replace(
  '</div>\n          </div>\n      </div>\n\n      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}\n\n      {/* ── INVENTORY ── */}\n      {tab === \'inv\' && (',
  '</div>\n          </div>\n        </div>\n        <div className="flex flex-wrap items-center gap-2 mb-3">\n          <select\n            value={siteFilter}\n            onChange={(e) => setSiteFilter(e.target.value)}\n            className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"\n          >\n            <option value="ALL">{t(\'allSites\')}</option>\n            {sites.map((s) => (\n              <option key={s.id} value={s.id}>{s.siteName} ({s.siteCode})</option>\n            ))}\n          </select>\n          <select\n            value={plantFilter}\n            onChange={(e) => setPlantFilter(e.target.value)}\n            className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none"\n          >\n            <option value="ALL">{t(\'allPlants\')}</option>\n            {plants\n              .filter((p) => siteFilter === \'ALL\' || p.siteId === siteFilter)\n              .map((p) => (\n                <option key={p.id} value={p.id}>\n                  {p.plantName} ({p.plantCode}) · {p.plantType === \'CONCRETE\' ? \'🏭 \' + t(\'plantConcrete\') : \'🧱 \' + t(\'plantBlock\')}\n                </option>\n              ))}\n          </select>\n        </div>\n        <div className="flex bg-white/[0.04] border border-white/10 rounded-lg overflow-hidden">\n          <button onClick={() => setTab(\'inv\')} className={`px-4 py-2 text-xs font-bold ${tab === \'inv\' ? \'bg-emerald-500 text-white\' : \'text-slate-400\'}`}>{t(\'tabInventory\')}</button>\n          <button onClick={() => setTab(\'pr\')} className={`px-4 py-2 text-xs font-bold ${tab === \'pr\' ? \'bg-emerald-500 text-white\' : \'text-slate-400\'}`}>{t(\'tabReorder\')}</button>\n          <button onClick={() => setTab(\'mix\')} className={`px-4 py-2 text-xs font-bold ${tab === \'mix\' ? \'bg-emerald-500 text-white\' : \'text-slate-400\'}`}>{t(\'tabMixes\')}</button>\n        </div>\n      </div>\n\n      {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2 mb-3">{error}</div>}\n\n      {/* ── INVENTORY ── */}\n      {tab === \'inv\' && (',
);

console.log('Part 4 done');

fs.writeFileSync(filePath, content);
console.log('Done');