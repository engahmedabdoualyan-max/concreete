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

fs.writeFileSync(filePath, content);
console.log('Part 1 done');