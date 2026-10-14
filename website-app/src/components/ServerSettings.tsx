import { useState } from 'react';
import { getServerUrl, setServerUrl, clearServerUrl, resolveApiBase } from '../api/client';

/**
 * Server connection settings — used by the Windows desktop build
 * (desktop-app-exe) so each plant can point the app at its own server
 * without rebuilding. Rendered as a collapsible block on the login screen.
 */
export default function ServerSettings() {
  const [url, setUrl] = useState(getServerUrl() ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg('');
    try {
      setServerUrl(url);
      setBusy(true);
      const res = await fetch(`${resolveApiBase()}/api/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMsg('✅ متصل بالخادم بنجاح — سجل الدخول الآن.');
    } catch {
      setMsg('⚠️ تم الحفظ لكن تعذر الوصول للخادم — تحقق من الرابط والإنترنت.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    clearServerUrl();
    setUrl('');
    setMsg('↩️ تمت العودة للخادم الافتراضي.');
  };

  return (
    <details className="bg-white/[0.04] border border-white/10 rounded-lg">
      <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-300">
        🖥️ إعدادات الخادم (لنسخة الديسكتوب / سيرفر خاص)
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <p className="text-[11px] text-slate-500">
          الحالي: <span dir="ltr" className="text-slate-300">{resolveApiBase()}</span>
        </p>
        <input
          dir="ltr"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://concrete.example.com"
          className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg text-sm focus:outline-none focus:border-sky-400/70 placeholder-slate-500"
        />
        {msg && <p className="text-[11px] font-bold text-slate-300">{msg}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy || !url.trim()}
            className="flex-1 bg-sky-600/20 text-sky-300 border border-sky-500/30 hover:bg-sky-600/30 text-xs px-3 py-2 rounded-lg font-bold disabled:opacity-50"
          >
            {busy ? '⏳ جارٍ الفحص...' : '💾 حفظ وفحص الاتصال'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="bg-white/[0.04] text-slate-300 border border-white/10 hover:bg-white/[0.08] text-xs px-3 py-2 rounded-lg font-bold"
          >
            افتراضي
          </button>
        </div>
      </div>
    </details>
  );
}
