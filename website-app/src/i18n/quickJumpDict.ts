import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  quickJump: { en: '🚀 Quick Jump...', ar: '🚀 انتقال سريع...', ru: '🚀 Быстрый переход...', de: '🚀 Schnellsprung...', it: '🚀 Salto rapido...', hi: '🚀 त्वरित जंप...', ur: '🚀 فوری جمپ...', ja: '🚀 クイックジャンプ...', zh: '🚀 快速跳转...' },
  materials: { en: '🏗️ Materials, Inventory & Mixes', ar: '🏗️ الخامات والمخزون والخلطات', ru: '🏗️ Материалы, запасы и смеси', de: '🏗️ Material, Lager & Mischungen', it: '🏗️ Materiali, magazzino e miscele', hi: '🏗️ सामग्री, इन्वेंट्री और मिक्स', ur: '🏗️ مواد، انوینٹری اور مکسز', ja: '🏗️ 材料・在庫・調合', zh: '🏗️ 材料、库存与配合比' },
  fleetCoding: { en: '🔗 Vehicle & Device Coding', ar: '🔗 ربط وتكويد المركبات', ru: '🔗 Кодирование ТС и устройств', de: '🔗 Fahrzeug- & Gerätekodierung', it: '🔗 Codifica veicoli e dispositivi', hi: '🔗 वाहन और डिवाइस कोडिंग', ur: '🔗 گاڑی اور ڈیوائس کوڈنگ', ja: '🔗 車両・デバイスコード付け', zh: '🔗 车辆与设备编码' },
  toggleCalendar: { en: 'Toggle calendar', ar: 'تبديل التقويم', ru: 'Переключить календарь', de: 'Kalender wechseln', it: 'Cambia calendario', hi: 'कैलेंडर बदलें', ur: 'کیلنڈر تبدیل کریں', ja: 'カレンダー切替', zh: '切换日历' },
  gregorian: { en: '📅 Gregorian', ar: '📅 ميلادي', ru: '📅 Григорианский', de: '📅 Gregorianisch', it: '📅 Gregoriano', hi: '📅 ग्रेगोरियन', ur: '📅 عیسوی', ja: '📅 西暦', zh: '📅 公历' },
  hijri: { en: '🌙 Hijri', ar: '🌙 هجري', ru: '🌙 Хиджрийский', de: '🌙 Hidschra', it: '🌙 Hijri', hi: '🌙 हिजरी', ur: '🌙 ہجری', ja: '🌙 ヒジュラ暦', zh: '🌙 回历' },
  home: { en: '🏠 Dashboard', ar: '🏠 الرئيسية', ru: '🏠 Dashboard', de: '🏠 Dashboard', it: '🏠 Dashboard', hi: '🏠 Dashboard', ur: '🏠 Dashboard', ja: '🏠 Dashboard', zh: '🏠 Dashboard' },
  operations: { en: '🚚 Operations Tracker', ar: '🚚 التشغيل', ru: '🚚 Operations', de: '🚚 Operations', it: '🚚 Operations', hi: '🚚 Operations', ur: '🚚 Operations', ja: '🚚 Operations', zh: '🚚 Operations' },
  workshop: { en: '🔧 Workshop / Maintenance', ar: '🔧 الورشة والصيانة', ru: '🔧 Workshop', de: '🔧 Workshop', it: '🔧 Workshop', hi: '🔧 Workshop', ur: '🔧 Workshop', ja: '🔧 Workshop', zh: '🔧 Workshop' },
  sites: { en: '🛰️ Sites & Fleet Map', ar: '🛰️ المواقع والأسطول', ru: '🛰️ Sites', de: '🛰️ Sites', it: '🛰️ Sites', hi: '🛰️ Sites', ur: '🛰️ Sites', ja: '🛰️ Sites', zh: '🛰️ Sites' },
  command: { en: '📺 Command Center', ar: '📺 بث الشاشة', ru: '📺 Command', de: '📺 Command', it: '📺 Command', hi: '📺 Command', ur: '📺 Command', ja: '📺 Command', zh: '📺 Command' },
  hr: { en: '👔 HR', ar: '👔 الموارد البشرية', ru: '👔 HR', de: '👔 HR', it: '👔 HR', hi: '👔 HR', ur: '👔 HR', ja: '👔 HR', zh: '👔 HR' },
  forms: { en: '📑 Forms library', ar: '📑 مكتبة النماذج', ru: '📑 Forms', de: '📑 Forms', it: '📑 Forms', hi: '📑 Forms', ur: '📑 Forms', ja: '📑 Forms', zh: '📑 Forms' },
  gate: { en: '⚖️ Gate & Scale', ar: '⚖️ البوابة والميزان', ru: '⚖️ Gate', de: '⚖️ Gate', it: '⚖️ Gate', hi: '⚖️ Gate', ur: '⚖️ Gate', ja: '⚖️ Gate', zh: '⚖️ Gate' },
  procurement: { en: '🧾 Procurement', ar: '🧾 المشتريات', ru: '🧾 Procurement', de: '🧾 Procurement', it: '🧾 Procurement', hi: '🧾 Procurement', ur: '🧾 Procurement', ja: '🧾 Procurement', zh: '🧾 Procurement' },
  mixing: { en: '🧪 Lab', ar: '🧪 المختبر', ru: '🧪 Лаборатория', de: '🧪 Labor', it: '🧪 Laboratorio', hi: '🧪 प्रयोगशाला', ur: '🧪 لیب', ja: '🧪 ラボ', zh: '🧪 实验室' },
  production: { en: '🏭 Production & Inventory', ar: '🏭 الإنتاج والمخزون', ru: '🏭 Production', de: '🏭 Production', it: '🏭 Production', hi: '🏭 Production', ur: '🏭 Production', ja: '🏭 Production', zh: '🏭 Production' },
  evaluation: { en: '📊 Plant OEE Evaluation', ar: '📊 تقييم المصنع', ru: '📊 Evaluation', de: '📊 Evaluation', it: '📊 Evaluation', hi: '📊 Evaluation', ur: '📊 Evaluation', ja: '📊 Evaluation', zh: '📊 Evaluation' },
  schedule: { en: '📅 Pouring Schedule', ar: '📅 جدول الصب', ru: '📅 Schedule', de: '📅 Schedule', it: '📅 Schedule', hi: '📅 Schedule', ur: '📅 Schedule', ja: '📅 Schedule', zh: '📅 Schedule' },
  orders: { en: '📦 Orders', ar: '📦 الطلبات والمبيعات', ru: '📦 Orders', de: '📦 Orders', it: '📦 Orders', hi: '📦 Orders', ur: '📦 Orders', ja: '📦 Orders', zh: '📦 Orders' },
  rnd: { en: '🔬 R&D', ar: '🔬 البحث والتطوير', ru: '🔬 R&D', de: '🔬 R&D', it: '🔬 R&D', hi: '🔬 R&D', ur: '🔬 R&D', ja: '🔬 R&D', zh: '🔬 R&D' },
  governance: { en: '🛡️ Governance: Weighbridge & Returns', ar: '🛡️ الحوكمة والميزان', ru: '🛡️ Governance', de: '🛡️ Governance', it: '🛡️ Governance', hi: '🛡️ Governance', ur: '🛡️ Governance', ja: '🛡️ Governance', zh: '🛡️ Governance' },
  finance: { en: '💰 Finance: Payments & Reorder', ar: '💰 المالية والمدفوعات', ru: '💰 Finance', de: '💰 Finance', it: '💰 Finance', hi: '💰 Finance', ur: '💰 Finance', ja: '💰 Finance', zh: '💰 Finance' },
  multiplant: { en: '🏭 Multi-Plant Command Center', ar: '🏭 متعدد المصانع', ru: '🏭 Multi-Plant', de: '🏭 Multi-Plant', it: '🏭 Multi-Plant', hi: '🏭 Multi-Plant', ur: '🏭 Multi-Plant', ja: '🏭 Multi-Plant', zh: '🏭 Multi-Plant' },
  suppliers: { en: '🏢 Suppliers directory', ar: '🏢 الموردون', ru: '🏢 Поставщики', de: '🏢 Lieferanten', it: '🏢 Fornitori', hi: '🏢 आपूर्तिकर्ता', ur: '🏢 سپلائرز', ja: '🏢 供給業者', zh: '🏢 供应商名录' },
  debts: { en: '💳 Customers & Debts', ar: '💳 العملاء والمديونيات', ru: '💳 Клиенты и долги', de: '💳 Kunden & Forderungen', it: '💳 Clienti & Debiti', hi: '💳 ग्राहक और देनदारियाँ', ur: '💳 گاہک اور قرضے', ja: '💳 顧客・売掛金', zh: '💳 客户及应收款' },
  boardWorkshop: { en: '🖥️ Workshop screen', ar: '🖥️ شاشة الورشة', ru: '🖥️ Экран цеха', de: '🖥️ Werkstatt-Bildschirm', it: '🖥️ Schermo officina', hi: '🖥️ वर्कशॉप स्क्रीन', ur: '🖥️ ورکشاپ اسکرین', ja: '🖥️ 整備画面', zh: '🖥️ 维修看板' },
  boardPlant: { en: '🏭 Plant screen (operator)', ar: '🏭 شاشة المحطة', ru: '🏭 Экран завода', de: '🏭 Anlagen-Bildschirm', it: '🏭 Schermo impianto', hi: '🏭 प्लांट स्क्रीन', ur: '🏭 پلانٹ اسکرین', ja: '🏭 プラント画面', zh: '🏭 搅拌站看板' },
};

export function useQuickJumpDict() {
  return usePageDict(DICT);
}