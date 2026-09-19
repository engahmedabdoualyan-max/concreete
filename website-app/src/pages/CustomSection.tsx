import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadEffectiveConfig } from '../firebase/firestore';
import { useCustomSectionDict } from '../i18n/customSectionDict';

export default function CustomSection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const t = useCustomSectionDict();
  const [info, setInfo] = useState<{ en?: string; ar?: string; image?: string; bgImage?: string; desc?: string }>(() => {
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

  const bgStyle = info.bgImage
    ? { backgroundImage: `url(${info.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.13), transparent), #080C14" };

  return (
    <div className="min-h-screen relative text-slate-200" style={bgStyle}>
      <div className="pointer-events-none absolute inset-0 bg-[#0B111E]/70" />
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0B111E]/80 backdrop-blur-xl p-8 shadow-2xl">
          {info.image && (
            <img src={info.image} alt="" className="w-32 h-32 rounded-2xl object-cover mx-auto mb-6 border border-white/10 shadow-[0_0_40px_rgba(56,189,248,0.3)]" />
          )}
          <h1 className="text-4xl font-black font-display text-white tracking-tight">
            {info.en || 'Custom Section'}
          </h1>
          {info.ar && <p className="text-xl font-bold text-sky-400 mt-3">{info.ar}</p>}
          {info.desc && <p className="text-sm text-slate-300 mt-4 leading-relaxed max-w-lg mx-auto">{info.desc}</p>}
          
          <div className="mt-8 p-6 bg-white/[0.04] border border-white/10 rounded-xl">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center text-2xl">📦</div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">{t('customSection')}</p>
                <p className="text-xs text-slate-400">Custom Section · {id}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('customDesc1')}
              <br />{t('customDesc2')}
            </p>
          </div>

          <button
            onClick={() => navigate('/')}
            className="mt-8 w-full bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]"
          >
            {t('backToMain')}
          </button>
        </div>
      </div>
    </div>
  );
}