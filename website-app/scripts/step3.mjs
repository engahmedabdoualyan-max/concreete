import fs from 'fs';

const filePath = '/home/dr-ahmed/.local/share/opencode/worktree/cac13e/playful-lagoon/website-app/src/pages/ErpMaterials.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add AutoCheckDisplay component before the export
const autoCheckComponent = `
// ─── AutoCheckDisplay Component ────────────────────────────────────────────────

function AutoCheckDisplay({ result }) {
  if (!result) return null;
  const t = useMaterialsDict();
  const hasCritical = result.summary.critical > 0;
  const hasWarnings = result.summary.warnings > 0;

  return (
    <div className="mb-3 rounded-lg border p-3 " + (result.summary.critical > 0 ? 'bg-red-500/10 border-red-500/40' : result.summary.warnings > 0 ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-emerald-500/10 border-emerald-500/40') + "}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">🤖 {t('autoCheckResult')} ({result.horizonDays} {t('days')})</span>
        <span className="text-[10px] px-2 py-0.5 rounded font-bold " + (result.summary.critical > 0 ? 'bg-red-500/20 text-red-200' : result.summary.warnings > 0 ? 'bg-yellow-500/20 text-yellow-200' : 'bg-emerald-500/20 text-emerald-300') + "}>
          {result.summary.critical > 0 && '🚨 ' + result.summary.critical + ' ' + t('critical')}
          {result.summary.warnings > 0 && ' ⚠️ ' + result.summary.warnings + ' ' + t('warnings')}
          {result.summary.critical === 0 && result.summary.warnings === 0 && '✅ ' + t('allGood')}
        </span>
      </div>
      <div className="space-y-1 text-[10px]">
        {result.materialDetails.map((m) => (
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
  );
}
`;

const beforeExport = 'export default function ErpMaterials() {';
content = content.replace(beforeExport, autoCheckComponent + '\n' + beforeExport);

// Also need to import useMaterialsDict in the component
content = content.replace(
  "const t = useMaterialsDict();",
  "const t = useMaterialsDict();"
);

fs.writeFileSync(filePath, content);
console.log('Done');