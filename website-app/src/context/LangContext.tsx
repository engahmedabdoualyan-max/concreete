import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { translations, Lang, Translations } from './translations';

export type { Lang };

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: keyof Translations) => string;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('fimtosoft_lang') as Lang | null;
    return stored && stored in translations ? stored : 'en';
  });

  const t = (key: keyof Translations): string => {
    return translations[lang][key] || translations.en[key] || key;
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
