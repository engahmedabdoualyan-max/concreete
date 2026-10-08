import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, resolveApiBase, getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  Accounting Integrations (Epic 6) — /integrations
 * ============================================================
 *  Manage external accounting connections (Zoho / QuickBooks /
 *  CSV bridge for SAP-Oracle), test them, push customers and
 *  invoices (Ticket → Invoice), download CSV drops, audit logs.
 * ============================================================
 */

interface Connection {
  id: string;
  provider: string;
  name: string;
  settings: Record<string, unknown>;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
}

interface SyncLog {
  id: string;
  entityType: string;
  localId: string | null;
  externalId: string | null;
  status: string;
  message: string | null;
  createdAt: string;
}

const PROVIDERS = [
  { id: 'ZOHO_BOOKS', label: 'Zoho Books', fields: ['clientId', 'clientSecret', 'refreshToken', 'region'] },
  { id: 'QUICKBOOKS', label: 'QuickBooks Online', fields: ['clientId', 'clientSecret', 'refreshToken', 'realmId'] },
  { id: 'CSV_BRIDGE', label: 'CSV Bridge (SAP / Oracle)', fields: [] as string[] },
];

const FIELD_HINTS: Record<string, string> = {
  clientId: 'OAuth Client ID',
  clientSecret: 'OAuth Client Secret',
  refreshToken: 'OAuth Refresh Token',
  realmId: 'Company ID (Realm)',
  region: 'com | eu | in (Zoho)',
};

export default function AccountingIntegrations() {
  const { currentUser } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [logs, setLogs] = useState<SyncLog[]>([]);

  // Add-connection form
  const [provider, setProvider] = useState('ZOHO_BOOKS');
  const [name, setName] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Push forms
  const [pushClientId, setPushClientId] = useState('');
  const [pushOrderId, setPushOrderId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: { connections: Connection[] } }>('/api/integrations/accounting');
      setConnections(res.data.connections);
      if (!selectedId && res.data.connections.length > 0) setSelectedId(res.data.connections[0].id);
    } catch { setMsg('⚠️ Could not load connections.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLogs = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await api.get<{ data: { logs: SyncLog[] } }>(`/api/integrations/accounting/${id}/logs`);
      setLogs(res.data.logs);
    } catch { setMsg('⚠️ Could not load logs.'); }
  };

  const addConnection = async () => {
    if (!name.trim()) { setMsg('⚠️ Name is required.'); return; }
    setBusy(true);
    try {
      await api.post('/api/integrations/accounting', { provider, name: name.trim(), credentials: creds, settings: {} });
      setMsg('✅ Connection registered.');
      setName(''); setCreds({});
      await load();
    } catch { setMsg('⚠️ Could not register connection.'); }
    setBusy(false);
  };

  const test = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.post<{ data: { ok: boolean; message: string } }>(`/api/integrations/accounting/${id}/test`);
      setMsg(res.data.ok ? `✅ ${res.data.message}` : `❌ ${res.data.message}`);
      await load();
    } catch { setMsg('⚠️ Test failed.'); }
    setBusy(false);
  };

  const pushCustomer = async () => {
    if (!selectedId || !pushClientId.trim()) { setMsg('⚠️ Select a connection and enter a Client ID.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ data: { ok: boolean; externalId?: string; message: string } }>(
        `/api/integrations/accounting/${selectedId}/push-customer`, { clientId: pushClientId.trim() });
      setMsg(res.data.ok ? `✅ Customer pushed → ${res.data.externalId}` : `❌ ${res.data.message}`);
      await loadLogs(selectedId);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Push failed.'}`); }
    setBusy(false);
  };

  const pushInvoice = async () => {
    if (!selectedId || !pushOrderId.trim()) { setMsg('⚠️ Select a connection and enter an Order ID.'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ data: { ok: boolean; externalId?: string; message: string } }>(
        `/api/integrations/accounting/${selectedId}/push-invoice`, { orderId: pushOrderId.trim() });
      setMsg(res.data.ok ? `✅ Invoice pushed → ${res.data.externalId}` : `❌ ${res.data.message}`);
      await loadLogs(selectedId);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Push failed.'}`); }
    setBusy(false);
  };

  const downloadCsv = async (type: 'customers' | 'invoices') => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${resolveApiBase()}/api/integrations/accounting/export?type=${type}&connectionId=${selectedId}`,
        { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} }
      );
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fimto-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`✅ ${type} CSV downloaded.`);
    } catch (e: any) { setMsg(`⚠️ ${e?.message || 'Export failed.'}`); }
    setBusy(false);
  };

  if (!currentUser) return <div className="min-h-screen bg-[#0B111E] flex items-center justify-center"><div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div></div>;

  const activeProvider = PROVIDERS.find(p => p.id === provider)!;
  const selected = connections.find(c => c.id === selectedId);

  const inputCls = 'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm';

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">💼 Accounting Integrations</h1>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        {/* Connections */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🔌 Connections ({connections.length})</h3>
          {loading ? <p className="text-slate-400">⏳ Loading...</p> : (
            <div className="space-y-3">
              {connections.map(c => (
                <div key={c.id} className={`border rounded-xl p-4 flex flex-wrap items-center gap-3 ${selectedId === c.id ? 'border-sky-500/50 bg-sky-500/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold text-white">{c.name} <span className="text-[10px] text-slate-400">· {c.provider}</span></p>
                    <p className="text-xs text-slate-400 mt-1">
                      {c.lastTestedAt ? (c.lastTestOk ? '✅ ' : '❌ ') + (c.lastTestMessage || '') : 'Not tested yet'}
                    </p>
                  </div>
                  <button onClick={() => loadLogs(c.id)} className="text-xs bg-white/[0.05] border border-white/10 px-3 py-1.5 rounded-lg font-bold hover:text-sky-300">📜 Logs</button>
                  <button onClick={() => test(c.id)} disabled={busy} className="text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-lg font-bold disabled:opacity-50">🧪 Test</button>
                </div>
              ))}
              {connections.length === 0 && <p className="text-slate-500 text-sm">No connections yet — register Zoho, QuickBooks or a CSV bridge below.</p>}
            </div>
          )}
        </div>

        {/* Add connection */}
        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">➕ Register Connection</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Provider</label>
              <select value={provider} onChange={e => { setProvider(e.target.value); setCreds({}); }} className={inputCls}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Zoho — Main Books" className={inputCls} />
            </div>
            {activeProvider.fields.map(f => (
              <div key={f}>
                <label className="block text-sm text-slate-300 mb-1">{FIELD_HINTS[f] || f}</label>
                <input
                  value={creds[f] || ''}
                  onChange={e => setCreds({ ...creds, [f]: e.target.value })}
                  type={f.toLowerCase().includes('secret') || f.toLowerCase().includes('token') ? 'password' : 'text'}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <button onClick={addConnection} disabled={busy} className="mt-4 w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg">➕ Register (credentials encrypted)</button>
        </div>

        {/* Push actions */}
        {selected && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-1">🚀 Push via {selected.name}</h3>
            <p className="text-xs text-slate-400 mb-4">Invoice push auto-creates the customer remotely first (Ticket → Invoice).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                <label className="block text-sm text-slate-300 mb-1">Client UUID → Customer</label>
                <input value={pushClientId} onChange={e => setPushClientId(e.target.value)} placeholder="client uuid" className={inputCls} />
                <button onClick={pushCustomer} disabled={busy} className="mt-3 w-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 font-bold py-2.5 rounded-lg text-sm">👤 Push Customer</button>
              </div>
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
                <label className="block text-sm text-slate-300 mb-1">Order UUID → Invoice</label>
                <input value={pushOrderId} onChange={e => setPushOrderId(e.target.value)} placeholder="order uuid" className={inputCls} />
                <button onClick={pushInvoice} disabled={busy} className="mt-3 w-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 font-bold py-2.5 rounded-lg text-sm">🧾 Push Invoice</button>
              </div>
            </div>
            {selected.provider === 'CSV_BRIDGE' && (
              <div className="flex gap-3 mt-4">
                <button onClick={() => downloadCsv('customers')} disabled={busy} className="flex-1 bg-white/[0.05] border border-white/10 hover:text-sky-300 disabled:opacity-50 font-bold py-2.5 rounded-lg text-sm">📥 Customers CSV</button>
                <button onClick={() => downloadCsv('invoices')} disabled={busy} className="flex-1 bg-white/[0.05] border border-white/10 hover:text-sky-300 disabled:opacity-50 font-bold py-2.5 rounded-lg text-sm">📥 Invoices CSV</button>
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        {selected && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-4">📜 Sync Log — {selected.name} ({logs.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map(l => (
                <div key={l.id} className="bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2.5 flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${l.status === 'OK' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{l.status}</span>
                  <span className="text-xs font-bold text-white">{l.entityType}</span>
                  {l.externalId && <span className="text-[11px] text-sky-300">→ {l.externalId}</span>}
                  <span className="text-[11px] text-slate-400 ml-auto">{new Date(l.createdAt).toLocaleString()}</span>
                  {l.message && <p className="w-full text-[11px] text-slate-500">{l.message}</p>}
                </div>
              ))}
              {logs.length === 0 && <p className="text-slate-500 text-sm">No sync activity yet.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
