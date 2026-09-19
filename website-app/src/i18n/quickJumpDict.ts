import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  materials: { en: '🏗️ Materials, Inventory & Mixes', ar: '🏗️ الخامات والمخزون والخلطات', ru: '🏗️ Материалы, запасы и смеси', de: '🏗️ Material, Lager & Mischungen', it: '🏗️ Materiali, magazzino e miscele', hi: '🏗️ सामग्री, इन्वेंट्री और मिक्स', ur: '🏗️ مواد، انوینٹری اور مکسز', ja: '🏗️ 材料・在庫・調合', zh: '🏗️ 材料、库存与配合比' },
  toggleCalendar: { en: 'Toggle calendar', ar: 'تبديل التقويم', ru: 'Переключить календарь', de: 'Kalender wechseln', it: 'Cambia calendario', hi: 'कैलेंडर बदलें', ur: 'کیلنڈر تبدیل کریں', ja: 'カレンダー切替', zh: '切换日历' },
  gregorian: { en: '📅 Gregorian', ar: '📅 ميلادي', ru: '📅 Григорианский', de: '📅 Gregorianisch', it: '📅 Gregoriano', hi: '📅 ग्रेगोरियन', ur: '📅 عیسوی', ja: '📅 西暦', zh: '📅 公历' },
  hijri: { en: '🌙 Hijri', ar: '🌙 هجري', ru: '🌙 Хиджрийский', de: '🌙 Hidschra', it: '🌙 Hijri', hi: '🌙 हिजरी', ur: '🌙 ہجری', ja: '🌙 ヒジュラ暦', zh: '🌙 回历' },
};

export function useQuickJumpDict() {
  return usePageDict(DICT);
}