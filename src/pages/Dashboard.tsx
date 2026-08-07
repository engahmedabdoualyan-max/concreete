import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';

// ======================== بيانات المشاريع ========================
interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'active' | 'coming_soon' | 'planned';
  url: string;
}

const PROJECTS: Project[] = [
  {
    id: 'concrete',
    name: '🏗️ ERP Concrete',
    description: 'نظام متكامل لإدارة مصانع الخرسانة (إنتاج، مخزون، صيانة، جودة)',
    icon: '🏗️',
    color: 'from-blue-600 to-blue-800',
    status: 'active',
    url: '/',
  },
  {
    id: 'asphalt',
    name: '🛣️ ERP Asphalt',
    description: 'نظام متكامل لإدارة مصانع الأسفلت (إنتاج، مخزون، صيانة)',
    icon: '🛣️',
    color: 'from-slate-600 to-slate-800',
    status: 'coming_soon',
    url: '/asphalt',
  },
  {
    id: 'automation',
    name: '🏭 أتمتة المحطات',
    description: 'تحويل محطات الخرسانة من تشغيل يدوي إلى أنظمة محوسبة متكاملة',
    icon: '🤖',
    color: 'from-emerald-600 to-emerald-800',
    status: 'active',
    url: '/automation',
  },
  {
    id: 'maintenance',
    name: '🔧 صيانة المحطات',
    description: 'صيانة دورية وطوارئ لمحطات الخرسانة والأسفلت',
    icon: '🔧',
    color: 'from-orange-600 to-orange-800',
    status: 'active',
    url: '/maintenance',
  },
  {
    id: 'webdesign',
    name: '🌐 تصميم مواقع',
    description: 'تصميم وتطوير مواقع ويب احترافية باستخدام أحدث التقنيات',
    icon: '🌐',
    color: 'from-purple-600 to-purple-800',
    status: 'coming_soon',
    url: '/webdesign',
  },
  {
    id: 'firealarm',
    name: '🔥 أنظمة إنذار',
    description: 'أنظمة إنذار وكاميرات مراقبة متكاملة للمصانع والمنشآت',
    icon: '🔥',
    color: 'from-red-600 to-red-800',
    status: 'planned',
    url: '/firealarm',
  },
  {
    id: 'networks',
    name: '🖥️ شبكات وبنية تحتية',
    description: 'شبكات لاسلكية، خوادم، تخزين سحابي، وأمن معلومات',
    icon: '🖥️',
    color: 'from-cyan-600 to-cyan-800',
    status: 'planned',
    url: '/networks',
  },
  {
    id: 'computervision',
    name: '👁️ كمبيوتر فيجن',
    description: 'رؤية آلية وذكاء اصطناعي للكشف والتحليل الذكي',
    icon: '👁️',
    color: 'from-pink-600 to-pink-800',
    status: 'planned',
    url: '/computervision',
  },
  {
    id: 'traffic',
    name: '🚦 حلول مرورية',
    description: 'أنظمة إدارة حركة ذكية ولوحات إرشادية رقمية',
    icon: '🚦',
    color: 'from-yellow-600 to-yellow-800',
    status: 'planned',
    url: '/traffic',
  },
];

// ======================== المكون الرئيسي ========================
export default function Dashboard() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { lang } = useLang();
  const [projects] = useState<Project[]>(PROJECTS);

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">✅ {lang === 'ar' ? 'نشط' : 'Active'}</span>;
      case 'coming_soon':
        return <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">🟡 {lang === 'ar' ? 'قريباً' : 'Coming Soon'}</span>;
      case 'planned':
        return <span className="text-[10px] bg-slate-500/20 text-slate-400 px-2 py-0.5 rounded-full font-bold">📋 {lang === 'ar' ? 'مخطط' : 'Planned'}</span>;
    }
  };

  const handleProjectClick = (project: Project) => {
    if (project.status === 'active') {
      navigate(project.url);
    } else {
      alert(`🚧 مشروع "${project.name}" قيد التطوير حالياً. سيتم إطلاقه قريباً!`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* ===== HEADER ===== */}
      <header className="bg-[#1e293b] border-b border-[#334155] px-6 py-4 sticky top-0 z-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏢</span>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">فيمتو سوفت للخدمات التكنولوجية</h1>
              <p className="text-xs text-emerald-500 font-medium">حلول متكاملة للتكنولوجيا الحياتية</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <QuickJump />
          <LangSelector />
          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">
                🟢 {currentUser.plantName}
              </span>
              <button
                onClick={() => navigate('/admin')}
                className="bg-purple-500/20 text-purple-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
              >
                Admin Panel
              </button>
              <button
                onClick={() => { useAuth().logout(); navigate('/login'); }}
                className="bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-500/20 text-blue-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
            >
              Login/Register
            </button>
          )}
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* ===== الهوية ===== */}
        <div className="text-center mb-12">
          <div className="inline-block bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl px-8 py-6 border border-blue-500/20 backdrop-blur-sm">
            <p className="text-sm text-slate-400 mb-1">🇪🇬 تأسست في مصر | 🇸🇦 نعمل في السعودية</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              حلول متكاملة للتكنولوجيا الحياتية
            </h2>
            <p className="text-slate-400 mt-2 max-w-2xl mx-auto text-sm">
              منذ 2003، نقدم حلولاً رقمية متطورة في مجالات متعددة: برمجيات تفاعلية، شبكات وبنية تحتية،
              أنظمة أمنية، كمبيوتر فيجن، حلول مرورية، وأنظمة متكاملة.
            </p>
          </div>
        </div>

        {/* ===== المشاريع ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className={`
                group relative bg-[#1e293b] rounded-xl border border-[#334155] p-6 
                transition-all duration-300 cursor-pointer
                hover:scale-[1.02] hover:shadow-2xl hover:border-blue-500/50
                ${project.status === 'active' ? 'hover:bg-[#1e2a3d]' : 'opacity-70 hover:opacity-100'}
              `}
            >
              {/* شريط الحالة */}
              <div className="absolute top-4 right-4">
                {getStatusBadge(project.status)}
              </div>

              {/* الأيقونة */}
              <div className={`
                text-4xl mb-4 w-16 h-16 rounded-xl flex items-center justify-center
                bg-gradient-to-br ${project.color} 
                group-hover:shadow-lg transition-all duration-300
              `}>
                {project.icon}
              </div>

              {/* الاسم والوصف */}
              <h3 className="text-lg font-bold text-white mb-2">{project.name}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{project.description}</p>

              {/* زر الدخول */}
              <div className="mt-4 pt-4 border-t border-[#334155]/50 flex justify-between items-center">
                <span className="text-xs text-slate-500">
                  {project.status === 'active' ? '🚀 اضغط للدخول' : '⏳ قيد التطوير'}
                </span>
                <span className="text-blue-400 group-hover:translate-x-1 transition-transform">
                  {project.status === 'active' ? '→' : '🔒'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ===== نبذة ===== */}
        <div className="mt-12 bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#334155] rounded-xl p-8">
          <div className="max-w-3xl mx-auto text-center">
            <h3 className="text-xl font-bold text-white mb-4">🇪🇬 من نحن؟</h3>
            <p className="text-slate-300 leading-relaxed">
              <span className="text-emerald-400 font-bold">فيمتو سوفت</span> شركة مصرية تأسست عام 2003،
              ونعمل حالياً في المملكة العربية السعودية. نقدم حلولاً تكنولوجية متكاملة في مجالات متعددة،
              تشمل برمجيات إدارة المصانع (ERP)، أنظمة الأمن والمراقبة، شبكات البنية التحتية،
              الذكاء الاصطناعي والرؤية الآلية، والحلول المرورية الذكية.
            </p>
            <div className="flex flex-wrap justify-center gap-6 mt-6 text-sm text-slate-400">
              <span>📞 +20 100 100 6627</span>
              <span>📧 info@fimtosoft.com</span>
              <span>📍 🇸🇦 السعودية | 🇪🇬 مصر</span>
            </div>
          </div>
        </div>

        {/* ===== تذييل ===== */}
        <footer className="mt-8 pt-6 border-t border-[#334155] text-center text-xs text-slate-500">
          <p>© 2003-2026 فيمتو سوفت للخدمات التكنولوجية. جميع الحقوق محفوظة.</p>
          <p className="mt-1">🏗️ تصميم وتطوير د. أحمد عبده عليان</p>
        </footer>
      </main>
    </div>
  );
}