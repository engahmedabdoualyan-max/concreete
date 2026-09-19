import { usePageDict, type PageDict } from './pageDict';

export function useMixingQualityDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
  labSample: { en: '🔬 Lab sample ', ar: '🔬 عينة معمل ', ru: '🔬 Лабораторный образец ', de: '🔬 Laborprobe ', it: '🔬 Campione di laboratorio ', hi: '🔬 प्रयोगशाला नमूना ', ur: '🔬 لیب نمونہ ', ja: '🔬 ラボサンプル ', zh: '🔬 实验室样品 ' },
  order: { en: 'Order ', ar: 'طلب ', ru: 'Заказ ', de: 'Auftrag ', it: 'Ordine ', hi: 'ऑर्डर ', ur: 'آرڈر ', ja: '注文 ', zh: '订单 ' },
  truck: { en: 'Truck ', ar: 'شاحنة ', ru: 'Миксер ', de: 'Fahrzeug ', it: 'Betoniera ', hi: 'ट्रक ', ur: 'ٹرک ', ja: 'トラック ', zh: '搅拌车 ' },
  sampleBodySuffix: { en: ' — sample taken from customer code (', ar: ' — العينة أُخذت من كود العميل (', ru: ' — образец взят из кода клиента (', de: ' — Probe entnommen aus Kundenkode (', it: ' — campione prelevato dal codice cliente (', hi: ' — नमूना ग्राहक कोड से लिया गया (', ur: ' — نمونہ کسٹمر کوڈ سے لیا گیا (', ja: ' — 顧客コードから採取（', zh: ' — 样品取自客户代码（' },
  andOrder: { en: ') + order', ar: ') + الطلب', ru: ') + заказ', de: ') + Auftrag', it: ') + ordine', hi: ') + ऑर्डर', ur: ') + آرڈر', ja: '）＋注文', zh: '）+ 订单' },
  orderLabel: { en: 'Order:', ar: 'طلب:', ru: 'Заказ:', de: 'Auftrag:', it: 'Ordine:', hi: 'ऑर्डर:', ur: 'آرڈر:', ja: '注文：', zh: '订单：' },
  linkSampleToOrder: { en: 'Link sample to order (optional)', ar: 'ربط العينة بالطلب (اختياري)', ru: 'Привязать образец к заказу (необязательно)', de: 'Probe mit Auftrag verknüpfen (optional)', it: 'Collega il campione all\'ordine (opzionale)', hi: 'नमूने को ऑर्डर से लिंक करें (वैकल्पिक)', ur: 'نمونہ کو آرڈر سے منسلک کریں (اختیاری)', ja: 'サンプルを注文にリンク（任意）', zh: '将样品关联到订单（可选）' },
  noLinking: { en: '— No linking —', ar: '— بدون ربط —', ru: '— Без привязки —', de: '— Keine Verknüpfung —', it: '— Nessun collegamento —', hi: '— कोई लिंकिंग नहीं —', ur: '— کوئی منسلک نہیں —', ja: '— リンクなし —', zh: '— 不关联 —' },
};