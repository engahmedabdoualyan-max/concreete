import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

/**
 * ============================================================
 *  Enterprise SSO Providers (Epic 11) — /sso
 * ============================================================
 *  Register Entra ID / Google / Okta (OIDC) per tenant.
 *  Login: GET /api/auth/sso/login?tenant=CODE&provider=id
 * ============================================================
 */

interface Provider {
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  active: boolean;
}

export default function SsoProviders() {
  const { currentUser } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [pid, setPid] = useState('');
  const [label, setLabel] = useState('');
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');

  const load = async () => {
    try {
      const res = await api.get<{ data: { providers: Provider[] } }>('/api/auth/sso/providers');
      setProviders(res.data.providers);
    } catch { setMsg('⚠️ Could not load providers (admin right needed).'); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!pid.trim() || !label.trim() || !issuer.trim() || !clientId.trim()) {
      setMsg('⚠️ id + label + issuer + clientId required.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/sso/providers', {
        id: pid.trim(), label: label.trim(), issuer: issuer.trim(),
        clientId: clientId.trim(),
        ...(secret.trim() ? { clientSecret: secret.trim() } : {}),
        active: true,
      });
      setMsg('✅ Provider saved (secret encrypted).');
      setPid(''); setLabel(''); setIssuer(''); setClientId(''); setSecret('');
      await load();
    } catch { setMsg('⚠️ Save failed.'); }
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!confirm(`Remove SSO provider "${id}"?`)) return;
    try {
      await api.del(`/api/auth/sso/providers/${id}`);
      setMsg('✅ Provider removed.');
      await load();
    } catch { setMsg('⚠️ Remove failed.'); }
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
          <h1 className="text-sm font-bold text-white">🔐 Enterprise SSO (OIDC)</h1>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {msg && <div className="bg-white/[0.04] border border-white/10 px-4 py-3 rounded-lg text-sm font-bold">{msg}</div>}

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">🏢 Identity Providers ({providers.length})</h3>
          <div className="space-y-2">
            {providers.map(p => (
              <div key={p.id} className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-bold text-white text-sm">{p.label} <span className="text-slate-500 font-normal">· {p.id}</span></p>
                  <p className="text-[11px] text-slate-500">{p.issuer}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${p.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>{p.active ? 'ACTIVE' : 'OFF'}</span>
                <button onClick={() => remove(p.id)} className="text-[11px] bg-red-500/15 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg font-bold">🗑️</button>
              </div>
            ))}
            {providers.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No providers yet.</p>}
          </div>
        </div>

        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-bold text-white mb-4">➕ Register Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={pid} onChange={e => setPid(e.target.value)} placeholder="id (e.g. entra)" className={inputCls} />
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Microsoft Entra ID)" className={inputCls} />
            <input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="Issuer URL (https://login.microsoftonline.com/…/v2.0)" className={`${inputCls} md:col-span-2`} />
            <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID" className={inputCls} />
            <input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Client secret (blank = keep)" type="password" className={inputCls} />
          </div>
          <button onClick={save} disabled={busy} className="mt-4 w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg">💾 Save (secret AES-encrypted)</button>
          <p className="text-[11px] text-slate-500 mt-3">Register redirect URI at your IdP: <span className="font-mono">https://concrete.fimtosoft.com/api/auth/sso/callback</span> · Login URL shape: <span className="font-mono">/api/auth/sso/login?tenant=TENANT_CODE&provider=id</span></p>
        </div>
      </main>
    </div>
  );
}
