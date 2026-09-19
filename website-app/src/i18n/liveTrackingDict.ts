import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  liveTitle: { en: 'Live truck tracking', ar: 'تتبع مباشر للشاحنات', ru: 'Прямое отслеживание грузовиков', de: 'Live-LKW-Verfolgung', it: 'Tracciamento camion in tempo reale', hi: 'लाइव ट्रक ट्रैकिंग', ur: 'ٹرکوں کی لائیو ٹریکنگ', ja: 'トラックのライブ追跡', zh: '卡车实时跟踪' },
  liveSub: { en: 'Your order is in progress — the truck is on its way to you · Live Truck Tracking', ar: 'طلبك قيد التنفيذ — الشاحنة في الطريق إليك · Live Truck Tracking', ru: 'Ваш заказ выполняется — грузовик в пути к вам · Live Truck Tracking', de: 'Ihre Bestellung läuft — der LKW ist auf dem Weg zu Ihnen · Live Truck Tracking', it: 'Il tuo ordine è in corso — il camion è in viaggio verso di te · Live Truck Tracking', hi: 'आपका ऑर्डर प्रगति में है — ट्रक आपके रास्ते में है · Live Truck Tracking', ur: 'آپ کا آرڈر جاری ہے — ٹرک آپ کی طرف راہ میں ہے · Live Truck Tracking', ja: '注文を処理中 — トラックがお客様のもとへ向かっています · Live Truck Tracking', zh: '您的订单进行中 — 卡车正在驶向您 · Live Truck Tracking' },
  etaMinute: { en: 'min', ar: 'دقيقة', ru: 'мин', de: 'Min.', it: 'min', hi: 'मिनट', ur: 'منٹ', ja: '分', zh: '分钟' },
  waitingSignal: { en: '📡 Waiting for GPS signal...', ar: '📡 في انتظار إشارة GPS...', ru: '📡 Ожидание GPS-сигнала...', de: '📡 Warten auf GPS-Signal...', it: '📡 In attesa del segnale GPS...', hi: '📡 GPS सिग्नल की प्रतीक्षा...', ur: '📡 GPS سگنل کا انتظار...', ja: '📡 GPS信号を待っています...', zh: '📡 等待 GPS 信号...' },
  plant: { en: 'Plant', ar: 'المصنع', ru: 'Завод', de: 'Werk', it: 'Impianto', hi: 'प्लांट', ur: 'پلانٹ', ja: '工場', zh: '搅拌站' },
  minShort: { en: 'min', ar: 'د', ru: 'мин', de: 'Mi', it: 'min', hi: 'मिन', ur: 'من', ja: '分', zh: '分' },
  truckN: { en: '🚚 Truck {n}', ar: '🚚 شاحنة {n}', ru: '🚚 Грузовик {n}', de: '🚚 LKW {n}', it: '🚚 Camion {n}', hi: '🚚 ट्रक {n}', ur: '🚚 ٹرک {n}', ja: '🚚 トラック {n}', zh: '🚚 卡车 {n}' },
  signalOld: { en: '(stale signal)', ar: '(إشارة قديمة)', ru: '(устаревший сигнал)', de: '(veraltetes Signal)', it: '(segnale vecchio)', hi: '(पुराना सिग्नल)', ur: '(پرانا سگنل)', ja: '（古い信号）', zh: '（信号过期）' },
  signalLive: { en: '(live)', ar: '(مباشر)', ru: '(в реальном времени)', de: '(live)', it: '(live)', hi: '(लाइव)', ur: '(لائیو)', ja: '（ライブ）', zh: '（实时）' },
  kmUnit: { en: 'km', ar: 'كم', ru: 'км', de: 'km', it: 'km', hi: 'किमी', ur: 'کلومیٹر', ja: 'km', zh: '公里' },
  forOrder: { en: 'For order: {orders}', ar: 'للطلب: {orders}', ru: 'По заказу: {orders}', de: 'Für Bestellung: {orders}', it: 'Per ordine: {orders}', hi: 'ऑर्डर के लिए: {orders}', ur: 'آرڈر کے لیے: {orders}', ja: '注文: {orders}', zh: '订单：{orders}' },
};

export function useLiveTrackingDict() {
  return usePageDict(DICT);
}