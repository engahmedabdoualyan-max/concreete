import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useLandingDict } from '../i18n/landingDict';

const FEATURES = [
  { icon: '📦', title: 'feOrders', desc: 'feOrdersDesc' },
  { icon: '🚚', title: 'feFleet', desc: 'feFleetDesc' },
  { icon: '🏭', title: 'feProduction', desc: 'feProductionDesc' },
  { icon: '🔧', title: 'feWorkshop', desc: 'feWorkshopDesc' },
  { icon: '🧪', title: 'feLab', desc: 'feLabDesc' },
  { icon: '📅', title: 'feSchedule', desc: 'feScheduleDesc' },
  { icon: '🛡️', title: 'feGovernance', desc: 'feGovernanceDesc' },
  { icon: '💰', title: 'feFinance', desc: 'feFinanceDesc' },
  { icon: '📊', title: 'feEval', desc: 'feEvalDesc' },
  { icon: '🏭', title: 'feMulti', desc: 'feMultiDesc' },
  { icon: '📱', title: 'feMobile', desc: 'feMobileDesc' },
  { icon: '🤖', title: 'feSales', desc: 'feSalesDesc' },
];

const PLANS = [
  { name: 'planFree', price: '0', period: '', features: ['pfUsers3', 'pfOnePlant', 'pf300mb', 'pfBasic'], cta: 'ctaFree', highlighted: false },
  { name: 'planPro', price: '199', period: 'perMonth', features: ['pfUnlimited', 'pfMulti', 'pf5gb', 'pfSupport', 'pfReports', 'pfMobile'], cta: 'ctaSubscribe', highlighted: true },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const t = useLandingDict();

  return (
    <div className="min-h-screen text-slate-200" style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.12), transparent), #080C14" }}>

      {/* Header */}
      <header className="bg-[#0B111E]/80 backdrop-blur-xl px-4 sm:px-6 py-3 sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo width={44} rounded="rounded-xl" />
            <span className="font-display text-lg font-black text-white tracking-wide">{t('brandLine')} <span className="text-sky-400">ERP</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/portal')} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors">
              {t('trackMyOrders')}
            </button>
            <button onClick={() => navigate('/')} className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs px-4 py-1.5 rounded-lg font-bold hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              {t('startNow')}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight text-white leading-tight">
          {t('heroTitle1')}<br />
          <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 bg-clip-text text-transparent">{t('heroTitle2')}</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          {t('heroSub')}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => navigate('/')} className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            {t('freeRegister')}
          </button>
          <button onClick={() => navigate('/portal')} className="bg-white/[0.05] border border-white/10 text-slate-300 font-bold py-3.5 px-8 rounded-xl text-sm hover:border-sky-400/50 hover:text-sky-300 transition-colors">
            {t('trackAsClient')}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">{t('heroNote')}</p>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-display font-black text-white text-center mb-12">{t('featuresTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-sky-400/40 hover:bg-white/[0.05] transition-all group">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-base font-bold text-white mt-3 group-hover:text-sky-300 transition-colors">{t(f.title)}</h3>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{t(f.desc)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-display font-black text-white text-center mb-4">{t('pricingTitle')}</h2>
        <p className="text-center text-slate-400 text-sm mb-10">{t('pricingSub')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map((p, i) => (
            <div key={i} className={`rounded-2xl p-6 border transition-all ${p.highlighted ? 'bg-sky-500/10 border-sky-400/50 shadow-[0_0_40px_rgba(56,189,248,0.15)]' : 'bg-white/[0.03] border-white/10'}`}>
              {p.highlighted && <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400 bg-sky-500/20 px-2.5 py-1 rounded-full border border-sky-500/30">{t('mostPopular')}</span>}
              <h3 className="text-xl font-black text-white mt-3">{t(p.name)}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-black text-white">{p.price}</span>
                {p.price !== '0' && <span className="text-sm text-slate-400">{t(p.period)}</span>}
                {p.price === '0' && <span className="text-sm text-slate-400">{t('foreverFree')}</span>}
              </div>
              <ul className="mt-4 space-y-2">
                {p.features.map((f, j) => (
                  <li key={j} className="text-sm text-slate-300 flex items-center gap-2">✅ {t(f)}</li>
                ))}
              </ul>
              <button onClick={() => navigate('/')}
                className={`w-full mt-6 py-3 rounded-xl font-bold text-sm transition-all ${p.highlighted ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white hover:from-sky-400 hover:to-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white/[0.05] border border-white/10 text-slate-300 hover:border-sky-400/50 hover:text-sky-300'}`}>
                {t(p.cta)}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-gradient-to-r from-sky-500/10 to-cyan-500/10 border border-sky-400/30 rounded-2xl p-8 sm:p-12">
          <h2 className="text-2xl sm:text-3xl font-display font-black text-white">{t('readyToStart')}</h2>
          <p className="text-slate-400 mt-3 text-sm">{t('ctaSub')}</p>
          <button onClick={() => navigate('/')} className="mt-6 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-bold py-3.5 px-10 rounded-xl text-sm hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            {t('startFreeCta')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Fimto Soft · Concrete ERP</p>
        <p className="mt-1">{t('madeWith')}</p>
      </footer>
    </div>
  );
}