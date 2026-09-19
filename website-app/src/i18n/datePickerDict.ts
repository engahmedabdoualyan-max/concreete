import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  gregorian: { en: '📅 Gregorian', ar: '📅 ميلادي', ru: '📅 Григорианский', de: '📅 Gregorianisch', it: '📅 Gregoriano', hi: '📅 ग्रेगोरियन', ur: '📅 عیسوی', ja: '📅 西暦', zh: '📅 公历' },
  hijri: { en: '🌙 Hijri', ar: '🌙 هجري', ru: '🌙 Хиджрийский', de: '🌙 Hidschra', it: '🌙 Hijri', hi: '🌙 हिजरी', ur: '🌙 ہجری', ja: '🌙 ヒジュラ暦', zh: '🌙 回历' },
  yearPlaceholder: { en: 'Year', ar: 'السنة', ru: 'Год', de: 'Jahr', it: 'Anno', hi: 'वर्ष', ur: 'سال', ja: '年', zh: '年份' },
};

export function useDatePickerDict() {
  return usePageDict(DICT);
}