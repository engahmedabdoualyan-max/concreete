import { usePageDict, type PageDict } from './pageDict';

export function useResearchDevelopmentDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  rdDel: { en: 'Del', ar: 'حذف', ru: 'Del', de: 'Del', it: 'Del', hi: 'Del', ur: 'Del', ja: 'Del', zh: 'Del' },
  rdCompleted: { en: 'Completed', ar: 'مكتملة', ru: 'Completed', de: 'Completed', it: 'Completed', hi: 'Completed', ur: 'Completed', ja: 'Completed', zh: 'Completed' },
  rdTrainings: { en: 'Total Trainings', ar: 'إجمالي التدريبات', ru: 'Total Trainings', de: 'Total Trainings', it: 'Total Trainings', hi: 'Total Trainings', ur: 'Total Trainings', ja: 'Total Trainings', zh: 'Total Trainings' },
  rdProjects: { en: 'Total Projects', ar: 'إجمالي المشاريع', ru: 'Total Projects', de: 'Total Projects', it: 'Total Projects', hi: 'Total Projects', ur: 'Total Projects', ja: 'Total Projects', zh: 'Total Projects' },
  rdIdeas: { en: 'Total Ideas', ar: 'إجمالي الأفكار', ru: 'Total Ideas', de: 'Total Ideas', it: 'Total Ideas', hi: 'Total Ideas', ur: 'Total Ideas', ja: 'Total Ideas', zh: 'Total Ideas' },
  rdBudget: { en: 'Total Budget', ar: 'إجمالي الميزانية', ru: 'Total Budget', de: 'Total Budget', it: 'Total Budget', hi: 'Total Budget', ur: 'Total Budget', ja: 'Total Budget', zh: 'Total Budget' },
  rdPlanned: { en: 'Planned', ar: 'مخططة', ru: 'Planned', de: 'Planned', it: 'Planned', hi: 'Planned', ur: 'Planned', ja: 'Planned', zh: 'Planned' },
  rdInProg: { en: 'In Progress', ar: 'جارية', ru: 'In Progress', de: 'In Progress', it: 'In Progress', hi: 'In Progress', ur: 'In Progress', ja: 'In Progress', zh: 'In Progress' },
  rdImpl: { en: 'Implemented', ar: 'مطبقة', ru: 'Implemented', de: 'Implemented', it: 'Implemented', hi: 'Implemented', ur: 'Implemented', ja: 'Implemented', zh: 'Implemented' },
  rdHigh: { en: 'High Impact', ar: 'تأثير عال', ru: 'High Impact', de: 'High Impact', it: 'High Impact', hi: 'High Impact', ur: 'High Impact', ja: 'High Impact', zh: 'High Impact' },
  rdBackLogin: { en: 'Back to Login', ar: 'عودة للدخول', ru: 'Back to Login', de: 'Back to Login', it: 'Back to Login', hi: 'Back to Login', ur: 'Back to Login', ja: 'Back to Login', zh: 'Back to Login' },

  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
};