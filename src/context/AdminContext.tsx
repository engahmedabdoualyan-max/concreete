import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLang } from './LangContext';

// ======================== أنواع البيانات ========================
interface ProjectData {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: 'active' | 'coming_soon' | 'planned';
  url: string;
}

interface AdminContent {
  companyName: string;
  companyTagline: string;
  companyDescription: string;
  aboutUsText: string;
  contactPhone: string;
  contactEmail: string;
  projects: ProjectData[];
}

// ======================== البيانات الافتراضية ========================
const DEFAULT_CONTENT: AdminContent = {
  companyName: 'فيمتو سوفت للخدمات التكنولوجية',
  companyTagline: 'حلول متكاملة للتكنولوجيا الحياتية',
  companyDescription: 'منذ 2003، نقدم حلولاً رقمية متطورة في مجالات متعددة: برمجيات تفاعلية، شبكات وبنية تحتية، أنظمة أمنية، كمبيوتر فيجن، حلول مرورية، وأنظمة متكاملة.',
  aboutUsText: 'فيمتو سوفت شركة مصرية تأسست عام 2003، ونعمل حالياً في المملكة العربية السعودية. نقدم حلولاً تكنولوجية متكاملة في مجالات متعددة، تشمل برمجيات إدارة المصانع (ERP)، أنظمة الأمن والمراقبة، شبكات البنية التحتية، الذكاء الاصطناعي والرؤية الآلية، والحلول المرورية الذكية.',
  contactPhone: '+20 100 100 6627',
  contactEmail: 'info@fimtosoft.com',
  projects: [
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
  ],
};

interface AdminContextType {
  content: AdminContent;
  updateContent: (newContent: AdminContent) => void;
  resetToDefault: () => void;
  isLoading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const STORAGE_KEY = 'fimtosoft_admin_content';

export function AdminProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<AdminContent>(DEFAULT_CONTENT);
  const [isLoading, setIsLoading] = useState(true);

  // تحميل البيانات من localStorage عند بدء التشغيل
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // دمج مع البيانات الافتراضية لضمان وجود جميع الحقول
        setContent({
          ...DEFAULT_CONTENT,
          ...parsed,
          projects: parsed.projects || DEFAULT_CONTENT.projects,
        });
      }
    } catch (error) {
      console.warn('Failed to load admin content, using defaults');
    }
    setIsLoading(false);
  }, []);

  // حفظ البيانات عند تغييرها
  const updateContent = (newContent: AdminContent) => {
    setContent(newContent);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newContent));
    } catch (error) {
      console.warn('Failed to save admin content');
    }
  };

  const resetToDefault = () => {
    setContent(DEFAULT_CONTENT);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONTENT));
    } catch (error) {
      console.warn('Failed to reset admin content');
    }
  };

  return (
    <AdminContext.Provider value={{ content, updateContent, resetToDefault, isLoading }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}