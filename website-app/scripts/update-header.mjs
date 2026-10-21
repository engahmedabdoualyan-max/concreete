import fs from 'fs';

const filePath = '/home/dr-ahmed/.local/share/opencode/worktree/cac13e/playful-lagoon/website-app/src/pages/ErpMaterials.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const oldHeader = `<div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
            <h3 className="text-sm font-bold text-white mb-3">{t('silosAndBins')}</h3>`;

const newHeader = `<div className="bg-white/[0.02] border border-emerald-500/20 rounded-xl p-4">
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
              <div className="mb-3 rounded-lg border p-3 " + (autoCheckResult.summary.critical > 0 ? 'bg-red-500/10 border-red-500/40' : autoCheckResult.summary.warnings > 0 ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-emerald-500/10 border-emerald-500/40') + "}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">🤖 {t('autoCheckResult')} ({autoCheckResult.horizonDays} {t('days')})</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold " + (autoCheckResult.summary.critical > 0 ? 'bg-red-500/20 text-red-200' : autoCheckResult.summary.warnings > 0 ? 'bg-yellow-500/20 text-yellow-200' : 'bg-emerald-500/20 text-emerald-300') + "}>
                    {autoCheckResult.summary.critical > 0 ? '🚨 ' + autoCheckResult.summary.critical + ' ' + t('critical') : ''}
                    {autoCheckResult.summary.warnings > 0 ? ' ⚠️ ' + autoCheckResult.summary.warnings + ' ' + t('warnings') : ''}
                    {autoCheckResult.summary.critical === 0 && autoCheckResult.summary.warnings === 0 ? '✅ ' + t('allGood') : ''}
                  </span>
                </div>
                <div className="space-y-1 text-[10px]">
                  {autoCheckResult.materialDetails.map((m) => (
                    <div key={m.category} className="flex justify-between " + (m.status === 'SHORTAGE' ? 'text-red-300' : m.status === 'LOW' ? 'text-yellow-300' : 'text-emerald-300') + "}>
                      <span>{m.category}: {m.requiredKg.toLocaleString()} kg / {m.availableKg.toLocaleString()} kg</span>
                      <span>
                        {m.shortageKg > 0 && '🚨 نقص ' + m.shortageKg.toLocaleString() + ' kg'}
                        {m.status === 'LOW' && '⚠️ ' + m.daysCoverage + ' ' + t('daysCoverage')}
                        {m.status === 'OK' && '✅ ' + m.daysCoverage + ' ' + t('daysCoverage')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}`;

content = content.replace(oldHeader, newHeader);
fs.writeFileSync(filePath, content);
console.log('Done');