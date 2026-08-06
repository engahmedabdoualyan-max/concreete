import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { arTranslations, enTranslations, urTranslations } from './translations';

export type Lang = 'ar' | 'en' | 'ur';

interface Translations {
  companyName: string;
  companyTagline: string;
  companyFounded: string;
  companyDescription: string;
  projectStatusActive: string;
  projectStatusComingSoon: string;
  projectStatusPlanned: string;
  projectEnter: string;
  projectUnderDevelopment: string;
  aboutUs: string;
  aboutUsText: string;
  contactPhone: string;
  contactEmail: string;
  footerRights: string;
  footerDesign: string;
}

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: keyof Translations) => string;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    return (localStorage.getItem('fimtosoft_lang') as Lang) || 'ar';
  });

  const translations: Record<Lang, Translations> = {
    ar: arTranslations,
    en: enTranslations,
    ur: urTranslations,
  };

  const t = (key: keyof Translations): string => {
    return translations[lang][key] || key;
  };

  useEffect(() => {
    localStorage.setItem('fimtosoft_lang', lang);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) {
    throw new Error('useLang must be used within LangProvider');
  }
  return context;
}
