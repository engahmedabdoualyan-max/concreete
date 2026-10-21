import fs from 'fs';

const filePath = '/home/dr-ahmed/.local/share/opencode/worktree/cac13e/playful-lagoon/website-app/src/pages/ErpMaterials.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add auto-check button and results after silosAndBins header
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
            <AutoCheckDisplay result={autoCheckResult} />`;

content = content.replace(oldHeader, newHeader);

fs.writeFileSync(filePath, content);
console.log('Part 2 done');