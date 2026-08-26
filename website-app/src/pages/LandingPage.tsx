import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';

const FEATURES = [
  { icon: '📦', title: 'إدارة الطلبات', desc: 'إدخال ومتابعة الطلبات بالكامل مع الموافقات والمدفوعات' },
  { icon: '🚚', title: 'تتبع الأسطول', desc: 'خريطة مباشرة لمواقع الشاحنات مع مراقبة التأخير' },
  { icon: '🏭', title: 'الإنتاج والمخزون', desc: 'متابعة التصنيع ومستويات المواد في الأléاف' },
  { icon: '🔧', title: 'الورشة', desc: 'صيانة الأسطول وقطع الغيار والوقود والزيوت' },
  { icon: '🧪', title: 'المختبر والجودة', desc: 'سجلات الاختبارات وتصميم الخلطات والتنبؤ بالمقاومة' },
  { icon: '📅', title: 'جدولة الصب', desc: 'جدول يومي ذكي مع خرائط وتتبع المسارات' },
  { icon: '🛡️', title: 'الحوكمة', desc: 'كباريز الوزن المحمية سلسلياً وتتبع الخرسانة المرتجعة' },
  { icon: '💰', title: 'المالية', desc: 'مدفوعات بـ QR وأوامر شراء تلقائية' },
  { icon: '📊', title: 'تقييم الأداء', desc: 'KPIs وOEE لكل محطة مع تحليل الأداء' },
  { icon: '🏭', title: 'المحطات المتعددة', desc: 'لوحة موحدة لإدارة كل محطاتك في مكان واحد' },
  { icon: '📱', title: 'تطبيق موبايل', desc: 'تابع شغلك من أي مكان عبر تطبيق الأندرويد' },
  { icon: '🤖', title: 'مدير المناديب', desc: 'تتبع خط سير المناديب وإسناد المهام اليومية' },
];

const PLANS = [
  { name: 'مجاني', price: '0', period: '/شهر', features: ['3 مستخدمين', 'محطة واحدة', '300 MB تخزين', 'جميع الأقسام الأساسية'], cta: 'ابدأ مجاناً', highlighted: false },
  { name: 'احترافي', price: '199', period: 'ر.س/شهر', features: ['مستخدمون غير محدود', 'محطات متعددة', '5 GB تخزين', 'دعم فني مباشر', 'تقارير متقدمة', 'تطبيق موبايل'], cta: 'اشترك الآن', highlighted: true },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen text-slate-200" style={{ background: "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(56,189,248,0.12), transparent), #080C14" }}>

      {/* Header */}
      <header className="bg-[#0B111E]/80 backdrop-blur-xl px-4 sm:px-6 py-3 sticky top-0 z-10 border-b border-white/10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo width={44} rounded="rounded-xl" />
            <span className="font-display text-lg font-black text-white tracking-wide">CONCRETE <span className="text-sky-400">ERP</span></span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/portal')} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-sky-400/60 hover:text-sky-300 transition-colors">
              👤 متابعة طلباتي
            </button>
            <button onClick={() => navigate('/')} className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs px-4 py-1.5 rounded-lg font-bold hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_15px_rgba(56,189,248,0.3)]">
              🚀 ابدأ الآن
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-16 sm:py-24 text-center">
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-display font-black tracking-tight text-white leading-tight">
          برنامج إدارة محطات<br />
          <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 bg-clip-text text-transparent">الخرسانة الجاهزة</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          لوحة تحكم ذكية تجمع كل أقسام محطتك في مكان واحد — من الطلبات والتتبع إلى الإنتاج والمختبر والمالية
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={() => navigate('/')} className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-bold py-3.5 px-8 rounded-xl text-sm hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            🎁 سجّل مجاناً — بدون بطاقة ائتمان
          </button>
          <button onClick={() => navigate('/portal')} className="bg-white/[0.05] border border-white/10 text-slate-300 font-bold py-3.5 px-8 rounded-xl text-sm hover:border-sky-400/50 hover:text-sky-300 transition-colors">
            👤 تابع طلباتك كعميل
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500"> trial مجاني لمدة 30 يوم · إعداد خلال 5 دقائق · بدون عقود</p>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-display font-black text-white text-center mb-12">كل اللي تحتاجه في مكان واحد</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 hover:border-sky-400/40 hover:bg-white/[0.05] transition-all group">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-base font-bold text-white mt-3 group-hover:text-sky-300 transition-colors">{f.title}</h3>
              <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-display font-black text-white text-center mb-4">أسعار بسيطة وواضحة</h2>
        <p className="text-center text-slate-400 text-sm mb-10">ابدأ مجاناً، وطور مع نمو أعمالك</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {PLANS.map((p, i) => (
            <div key={i} className={`rounded-2xl p-6 border transition-all ${p.highlighted ? 'bg-sky-500/10 border-sky-400/50 shadow-[0_0_40px_rgba(56,189,248,0.15)]' : 'bg-white/[0.03] border-white/10'}`}>
              {p.highlighted && <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400 bg-sky-500/20 px-2.5 py-1 rounded-full border border-sky-500/30">الأكثر شيوعاً</span>}
              <h3 className="text-xl font-black text-white mt-3">{p.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-3xl font-black text-white">{p.price}</span>
                {p.price !== '0' && <span className="text-sm text-slate-400">{p.period}</span>}
                {p.price === '0' && <span className="text-sm text-slate-400">مجاني للأبد</span>}
              </div>
              <ul className="mt-4 space-y-2">
                {p.features.map((f, j) => (
                  <li key={j} className="text-sm text-slate-300 flex items-center gap-2">✅ {f}</li>
                ))}
              </ul>
              <button onClick={() => navigate('/')}
                className={`w-full mt-6 py-3 rounded-xl font-bold text-sm transition-all ${p.highlighted ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white hover:from-sky-400 hover:to-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-white/[0.05] border border-white/10 text-slate-300 hover:border-sky-400/50 hover:text-sky-300'}`}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-gradient-to-r from-sky-500/10 to-cyan-500/10 border border-sky-400/30 rounded-2xl p-8 sm:p-12">
          <h2 className="text-2xl sm:text-3xl font-display font-black text-white">جاهز تبدأ؟</h2>
          <p className="text-slate-400 mt-3 text-sm">سجّل الآن وجرّب مجاناً لمدة 30 يوم — بدون بطاقة ائتمان</p>
          <button onClick={() => navigate('/')} className="mt-6 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-bold py-3.5 px-10 rounded-xl text-sm hover:from-sky-400 hover:to-cyan-400 transition-all shadow-[0_0_25px_rgba(56,189,248,0.35)]">
            🚀 ابدأ الآن مجاناً
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Fimto Soft · Concrete ERP</p>
        <p className="mt-1">made with ❤️ for the concrete industry</p>
      </footer>
    </div>
  );
}
