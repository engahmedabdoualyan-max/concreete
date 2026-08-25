import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadEffectiveConfig } from '../firebase/firestore';

export default function CustomSection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ en?: string; ar?: string; image?: string }>(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('fimto_module_config') || '{}');
      return (cfg.custom || []).find((c: any) => c.id === id) || {};
    } catch { return {}; }
  });

  useEffect(() => {
    let mounted = true;
    loadEffectiveConfig().then(cfg => {
      if (!mounted) return;
      const found = (cfg.custom || []).find((c: any) => c.id === id);
      if (found) setInfo(found);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [id]);

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center p-6 text-center text-slate-200"
      style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.13), transparent), #080C14" }}
    >
      <div className="pointer-events-none absolute inset-0 blur-3xl" style={{ background: "radial-gradient(ellipse 40% 50% at 50% 40%, rgba(56,189,248,0.2), transparent 70%)" }} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0B111E]/60 backdrop-blur-xl p-8">
        {info.image && (
          <img src={info.image} alt="" className="w-24 h-24 rounded-2xl object-cover mx-auto mb-4 border border-white/10 shadow-[0_0_30px_rgba(56,189,248,0.25)]" />
        )}
        <h1 className="text-3xl font-black font-display text-white tracking-tight">
          {info.en || 'Custom Section'}
        </h1>
        {info.ar && <p className="text-lg font-bold text-sky-400 mt-2">{info.ar}</p>}
        <p className="text-sm text-slate-400 mt-5 leading-relaxed">
          هذا القسم قيد الإنشاء — سيتم تفعيله قريباً 🚧
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-8 w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]"
        >
          ← العودة للوحة الرئيسية
        </button>
      </div>
    </div>
  );
}