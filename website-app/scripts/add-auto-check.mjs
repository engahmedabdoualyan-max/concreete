import fs from 'fs';

const filePath = '/home/dr-ahmed/.local/share/opencode/worktree/cac13e/playful-lagoon/website-app/src/pages/ErpMaterials.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add auto-check state variables
content = content.replace(
  'const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);',
  'const [stockResult, setStockResult] = useState<StockCheckResult | null>(null);\n  const [autoCheckResult, setAutoCheckResult] = useState<{ horizonDays: number; totalPlannedM3: number; materialDetails: any[]; alerts: any[]; summary: any } | null>(null);\n  const [autoCheckBusy, setAutoCheckBusy] = useState(false);'
);

// 2. Add runAutoCheck function
content = content.replace(
  'const runStockCheck = async (e: React.FormEvent) => {',
  'const runAutoCheck = async (days: number) => {\n    setAutoCheckBusy(true);\n    setError(\'\');\n    try {\n      const res = await api.get(`/api/inventory/auto-check?days=${days}`);\n      if (res) setAutoCheckResult(res);\n    } catch (e: any) {\n      setError(e?.message || t(\'autoCheckFail\'));\n    } finally {\n      setAutoCheckBusy(false);\n    }\n  };\n\n  const runStockCheck = async (e: React.FormEvent) => {'
);

// 3. Add auto-check button and results after silosAndBins header
content = content.replace(
  `<div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">{t('silosAndBins')}</h3>`,
  `<div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white">{t('silosAndBins')}</h3>
              <button
                onClick={() => runAutoCheck(7)}
                disabled={autoCheckBusy}
                className="text-[11px] font-black rounded-lg px-3 py-1.5 border border-sky-500/50 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 disabled:opacity-50"
              >
                {autoCheckBusy ? '⏳' : '🤖 ' + t('autoCheck')}
              </button>
            </div>

            {autoCheckResult && (
              <div className={\`mb-3 rounded-lg border p-3 \${autoCheckResult.summary.critical > 0 ? 'bg-red-500/10 border-red-500/40' : autoCheckResult.summary.warnings > 0 ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-emerald-500/10 border-emerald-500/40'}\`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">🤖 {t('autoCheckResult')} ({autoCheckResult.horizonDays} {t('days')})</span>
                  <span className={\`text-[10px] px-2 py-0.5 rounded font-bold \${autoCheckResult.summary.critical > 0 ? 'bg-red-500/20 text-red-200' : autoCheckResult.summary.warnings > 0 ? 'bg-yellow-500/20 text-yellow-200' : 'bg-emerald-500/20 text-emerald-300'}\`}>
                    {autoCheckResult.summary.critical > 0 ? \`🚨 \${autoCheckResult.summary.critical} \${t('critical')}\` : ''}
                    {autoCheckResult.summary.warnings > 0 ? \` ⚠️ \${autoCheckResult.summary.warnings} \${t('warnings')}\` : ''}
                    {autoCheckResult.summary.critical === 0 && autoCheckResult.summary.warnings === 0 ? \`✅ \${t('allGood')}\` : ''}
                  </span>
                </div>
                <div className="space-y-1 text-[10px]">
                  {autoCheckResult.materialDetails.map((m: any) => (
                    <div key={m.category} className={\`flex justify-between \${m.status === 'SHORTAGE' ? 'text-red-300' : m.status === 'LOW' ? 'text-yellow-300' : 'text-emerald-300'}\`}>
                      <span>{\${m.category}: \${m.requiredKg.toLocaleString()} \${t('kg')} / \${m.availableKg.toLocaleString()} \${t('kg')}\}</span>
                      <span>
                        {m.shortageKg > 0 && \`🚨 نقص \${m.shortageKg.toLocaleString()} \${t('kg')}\`}
                        {m.status === 'LOW' && \`⚠️ \${m.daysCoverage} \${t('daysCoverage')}\`}
                        {m.status === 'OK' && \`✅ \${m.daysCoverage} \${t('daysCoverage')}\`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}`);

fs.writeFileSync(filePath, content);
console.log('Done');