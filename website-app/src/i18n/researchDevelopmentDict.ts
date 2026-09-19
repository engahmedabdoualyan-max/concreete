import { usePageDict, type PageDict } from './pageDict';

export function useResearchDevelopmentDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
};