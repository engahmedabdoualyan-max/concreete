import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  ZATCA Phase-2 Compliance (Epic 7) — /zatca
 * ============================================================
 *  Taxpayer config (tokens encrypted server-side) + issue
 *  e-invoices from orders + registry + acceptance stats.
 * ============================================================
 */

interface ZatcaConfig {
  sellerName: string;
  vatNumber: string;
  street?: string;
  city?: string;
  branchName?: string;
  env: 'sandbox' | 'simulation' | 'production';
  configured: boolean;
  credentialStatus?: 'UNCONFIGURED' | 'INCOMPLETE' | 'CONFIGURED' | 'CORRUPTED';
}

interface ZatcaDoc {
  id: string;
  orderId: string | null;
  invoiceNumber: string;
  invoiceUuid: string;
  invoiceType: string;
  status: string;
  counterValue: number;
  invoiceHash: string | null;
  totals: { exVat: number; vatAmount: number; total: number; currency: string } | null;
  rejectionReason: string | null;
  clearedAt: string | null;
  createdAt: string;
}

interface Summary {
  total: number;
  byStatus: Record<string, number>;
  submitted: number;
  accepted: number;
  acceptanceRatePct: number;
  pending: number;
}

const STATUS_STYLE: Record<string, string> = {
  CLEARED: 'bg-emerald-500/20 text-emerald-400',
  REPORTED: 'bg-emerald-500/20 text-emerald-400',
  PENDING: 'bg-amber-500/20 text-amber-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  DRAFT: 'bg-slate-500/20 text-slate-400',
};

export default function ZatcaCompliance() {
  const { currentUser } = useAuth();
  const [config, setConfig] = useState<ZatcaConfig | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [docs, setDocs] = useState<ZatcaDoc[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ sellerName: '', vatNumber: '', street: '', city: '', branchName: '', env: 'sandbox' as 'sandbox' | 'simulation' | 'production', binaryToken: '', secret: '' });
  const [issueOrderId, setIssueOrderId] = useState('');
  const [issueType, setIssueType] = useState<'STANDARD' | 'SIMPLIFIED'>('STANDARD');
  const [testResult, setTestResult] = useState<{ ok: boolean; env: string; message: string; testedAt: string } | null>(null);

  const load = async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<{ data: { summary: Summary; config: ZatcaConfig } }>('/api/finance/zatca/status'),
        api.get<{ data: { documents: ZatcaDoc[] } }>('/api/finance/zatca/documents'),
      ]);
      setSummary(s.data.summary);
      setConfig(s.data.config);
      setDocs(d.data.documents);
      setForm(f => ({
        ...f,
        sellerName: s.data.config.sellerName || f.sellerName,
        vatNumber: s.data.config.vatNumber || f.vatNumber,
        street: s.data.config.street || f.street,
        city: s.data.config.city || f.city,
        branchName: s.data.config.branchName || f.branchName,
        env: s.data.config.env || f.env,
      }));
    } catch { setMsg('⚠️ Could not load ZATCA status.'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveConfig = async () => {
    if (!form.sellerName.trim() || !form.vatNumber.trim()) { setMsg('⚠️ Seller name + VAT number are required.'); return; }
    setBusy(true);
    try {
      const payload: Record<string, string | boolean> = {
        sellerName: form.sellerName.trim(), vatNumber: form.vatNumber.trim(), env: form.env,
      };
      if (form.street.trim()) payload.street = form.street.trim();
      if (form.city.trim()) payload.city = form.city.trim();
      if (form.branchName.trim()) payload.branchName = form.branchName.trim();
      const confirmProduction = form.env !== 'production' || window.confirm(
        'Confirm production ZATCA environment. This must only be enabled after sandbox verification.'
      );
      if (!confirmProduction) { setBusy(false); return; }
      payload.confirmProduction = form.env === 'production';
      if (form.binaryToken.trim()) payload.binaryToken = form.binaryToken.trim();
      if (form.secret.trim()) payload.secret = form.secret.trim();
      await api.post('/api/finance/zatca/config', payload);
      setForm(f => ({ ...f, binaryToken: '', secret: '' }));
      setMsg('✅ Taxpayer config saved (tokens encrypted).');
      await load();
    } catch { setMsg('⚠️ Could not save config.'); }
    setBusy(false);
  };

  const issue = async () => {
    if (!issueOrderId.trim()) { setMsg('⚠️ Order ID is required.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ data: { invoiceNumber: string; status: string }; message: string }>(
        '/api/finance/zatca/issue', { orderId: issueOrderId.trim(), type: issueType });
      const state = res.data.status;
      const marker = state === 'CLEARED' || state === 'REPORTED'
        ? '✅'
        : state === 'PENDING'
          ? '⏳'
          : '⚠️';
      setMsg(`${marker} ${res.message} (${res.data.invoiceNumber})`);
      if (state === 'CLEARED' || state === 'REPORTED' || state === 'PENDING') setIssueOrderId('');
      await load();
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Issue failed.'}`); }
    setBusy(false);
  };

  // NOTE: the backend exposes only POST /api/finance/zatca/test (no GET).
  const testConnection = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      const res = await api.post<{ ok: boolean; env: string; message: string; testedAt: string }>(
        '/api/finance/zatca/test');
      setTestResult(res);
      setMsg(res.ok ? `✅ ${res.message}` : `⚠️ ${res.message}`);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Test failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🧾 ZATCA Phase-2 Compliance</h1>
        </div>
        {config && (
          <span className={`text-xs px-3 py-1.5 rounded-lg font-bold border ${config.configured ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
            {config.configured
              ? config.env === 'production'
                ? '🟢 Production configured'
                : config.env === 'sandbox'
                  ? '🧪 Sandbox configured'
                  : '🧪 Simulation configured'
              : config.credentialStatus === 'CORRUPTED'
                ? '🔴 Stored credentials are corrupted'
                : '🟡 Credentials missing — documents remain PENDING'}
          </span>
        )}
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        {/* Stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.04] border-l-4 border-sky-500 rounded-lg p-4"><p className="text-xs text-slate-400">Documents</p><p className="text-2xl font-bold text-white">{summary.total}</p></div>
            <div className="bg-white/[0.04] border-l-4 border-emerald-500 rounded-lg p-4"><p className="text-xs text-slate-400">Acceptance</p><p className="text-2xl font-bold text-white">{summary.acceptanceRatePct}%</p></div>
            <div className="bg-white/[0.04] border-l-4 border-amber-500 rounded-lg p-4"><p className="text-xs text-slate-400">Pending (QR-only)</p><p className="text-2xl font-bold text-white">{summary.pending}</p></div>
            <div className="bg-white/[0.04] border-l-4 border-red-500 rounded-lg p-4"><p className="text-xs text-slate-400">Rejected</p><p className="text-2xl font-bold text-white">{summary.byStatus.REJECTED ?? 0}</p></div>
          </div>
        )}

        {/* Taxpayer config */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🏢 Taxpayer (المكلف)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={form.sellerName} onChange={e => setForm({ ...form, sellerName: e.target.value })} placeholder="Seller name (as in CR)" className={inputCls} />
            <input value={form.vatNumber} onChange={e => setForm({ ...form, vatNumber: e.target.value })} placeholder="VAT number (15 digits)" className={inputCls} />
            <input value={form.street} onChange={e => setForm({ ...form, street: e.target.value })} placeholder="Street" className={inputCls} />
            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City" className={inputCls} />
            <input value={form.branchName} onChange={e => setForm({ ...form, branchName: e.target.value })} placeholder="Branch (optional)" className={inputCls} />
            <select value={form.env} onChange={e => setForm({ ...form, env: e.target.value as 'sandbox' | 'simulation' | 'production' })} className={inputCls}>
              <option value="sandbox">🧪 Sandbox (Developer Portal)</option>
              <option value="simulation">🧪 Simulation (TQA)</option>
              <option value="production">🚀 Production</option>
            </select>
            <input value={form.binaryToken} onChange={e => setForm({ ...form, binaryToken: e.target.value })} placeholder="Fatoora BinarySecurityToken (leave blank to keep)" type="password" className={inputCls} />
            <input value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder="Fatoora Secret (leave blank to keep)" type="password" className={inputCls} />
          </div>
          <button onClick={saveConfig} disabled={busy} className="mt-4 w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg">💾 Save (tokens AES-encrypted)</button>
          <button onClick={testConnection} disabled={busy} className="mt-2 w-full bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg">🔌 اختبار الاتصال (Test Connection)</button>
          {testResult && (
            <div className={`mt-3 border rounded-lg px-4 py-3 text-sm font-bold ${testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
              {testResult.ok ? '✅' : '⚠️'} [{testResult.env}] {testResult.message}
              <span className="block text-[11px] font-normal opacity-70 mt-1">{new Date(testResult.testedAt).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Issue */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🧾 Issue E-Invoice from Order</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input value={issueOrderId} onChange={e => setIssueOrderId(e.target.value)} placeholder="Order UUID" className={inputCls} />
            <select value={issueType} onChange={e => setIssueType(e.target.value as 'STANDARD' | 'SIMPLIFIED')} className={inputCls}>
              <option value="STANDARD">🏢 STANDARD — B2B clearance</option>
              <option value="SIMPLIFIED">🧾 SIMPLIFIED — B2C reporting</option>
            </select>
            <button onClick={issue} disabled={busy} className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg">⚡ Issue</button>
          </div>
        </div>

        {/* Registry */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">📚 Invoice Registry ({docs.length})</h3>
          <div className="space-y-2 max-h-[480px] overflow-y-auto">
            {docs.map(d => (
              <div key={d.id} className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-white text-sm">{d.invoiceNumber} <span className="text-slate-400 font-normal">#{d.counterValue}</span></p>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${STATUS_STYLE[d.status] ?? STATUS_STYLE.DRAFT}`}>{d.status}</span>
                  <span className="text-[10px] text-slate-500">{d.invoiceType}</span>
                  <span className="text-[11px] text-slate-400 ml-auto">{new Date(d.createdAt).toLocaleString()}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 mt-1">
                  {d.totals && <span>💰 {d.totals.total} {d.totals.currency} (VAT {d.totals.vatAmount})</span>}
                  {d.invoiceHash && <span className="font-mono">⛓️ {d.invoiceHash.slice(0, 16)}…</span>}
                </div>
                {d.rejectionReason && <p className="text-[11px] text-red-400 mt-1">❌ {d.rejectionReason}</p>}
              </div>
            ))}
            {docs.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No e-invoices yet.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
