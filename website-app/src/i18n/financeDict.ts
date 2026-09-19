import { usePageDict, type PageDict } from './pageDict';

export function useFinanceDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
  accountingLink: { en: '🔗 Accounting integration', ar: '🔗 ربط المحاسبة', ru: '🔗 Интеграция с бухгалтерией', de: '🔗 Buchhaltungsintegration', it: '🔗 Integrazione contabile', hi: '🔗 लेखांकन एकीकरण', ur: '🔗 اکاؤنٹنگ انٹیگریشن', ja: '🔗 会計連携', zh: '🔗 会计集成' },
  accountingSetup: { en: '⚙️ Setup integration', ar: '⚙️ إعداد الربط', ru: '⚙️ Настроить интеграцию', de: '⚙️ Integration einrichten', it: '⚙️ Configura integrazione', hi: '⚙️ एकीकरण सेट करें', ur: '⚙️ انٹیگریشن سیٹ کریں', ja: '⚙️ 連携の設定', zh: '⚙️ 设置集成' },
};