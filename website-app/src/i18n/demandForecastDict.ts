import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  title: { en: '🤖 AI Demand Forecast', ar: '🤖 توقع الطلب بالذكاء الاصطناعي', ru: '🤖 ИИ-прогноз спроса', de: '🤖 KI-Nachfrageprognose', it: '🤖 Previsione domanda IA', hi: '🤖 AI मांग पूर्वानुमान', ur: '🤖 AI مانگ کی پیش گوئی', ja: '🤖 AI需要予測', zh: '🤖 AI 需求预测' },
  subtitle: { en: 'Analyzing the last 90 days — weighted average + weekday seasonality + linear trend', ar: 'تحليل آخر 90 يوم — متوسط مرجح + موسمية أيام الأسبوع + اتجاه خطي', ru: 'Анализ последних 90 дней — взвешенное среднее + сезонность по дням недели + линейный тренд', de: 'Analyse der letzten 90 Tage — gewichteter Mittelwert + Wochentagssaisonalität + linearer Trend', it: 'Analisi degli ultimi 90 giorni — media ponderata + stagionalità dei giorni della settimana + trend lineare', hi: 'पिछले 90 दिनों का विश्लेषण — भारित औसत + सप्ताह के दिन मौसमी + रैखिक प्रवृत्ति', ur: 'پچھلے 90 دنوں کا تجزیہ — وزنی اوسط + ہفتہ کے دن کی موسمیت + خطی رجحان', ja: '過去90日を分析 — 加重平均＋曜日季節性＋線形トレンド', zh: '分析过去90天 — 加权平均＋星期季节性＋线性趋势' },
  daysShort: { en: '{h} days', ar: '{h} يوم', ru: '{h} дн.', de: '{h} Tage', it: '{h} giorni', hi: '{h} दिन', ur: '{h} دن', ja: '{h}日間', zh: '{h} 天' },
  predictedDemand: { en: 'Forecasted demand ({horizon} days)', ar: 'الطلب المتوقع ({horizon} يوم)', ru: 'Прогнозируемый спрос ({horizon} дн.)', de: 'Prognostizierte Nachfrage ({horizon} Tage)', it: 'Domanda prevista ({horizon} giorni)', hi: 'अनुमानित मांग ({horizon} दिन)', ur: 'متوقع مانگ ({horizon} دن)', ja: '予測需要（{horizon}日）', zh: '预测需求（{horizon} 天）' },
  m3Unit: { en: 'm³', ar: 'م³', ru: 'м³', de: 'm³', it: 'm³', hi: 'm³', ur: 'm³', ja: 'm³', zh: 'm³' },
  trendUp: { en: '📈 Rising', ar: '📈 صاعد', ru: '📈 Рост', de: '📈 Steigend', it: '📈 In crescita', hi: '📈 बढ़ रहा', ur: '📈 اوپر رجحان', ja: '📈 上昇', zh: '📈 上升' },
  trendDown: { en: '📉 Falling', ar: '📉 هابط', ru: '📉 Спад', de: '📉 Fallend', it: '📉 In calo', hi: '📉 गिर रहा', ur: '📉 نیچے رجحان', ja: '📉 下降', zh: '📉 下降' },
  trendFlat: { en: '➡️ Stable', ar: '➡️ مستقر', ru: '➡️ Стабильно', de: '➡️ Stabil', it: '➡️ Stabile', hi: '➡️ स्थिर', ur: '➡️ مستحکم', ja: '➡️ 横ばい', zh: '➡️ 平稳' },
  avgDaily: { en: 'Avg. daily forecast', ar: 'المتوسط اليومي المتوقع', ru: 'Среднесуточный прогноз', de: 'Ø Tagesprognose', it: 'Media giornaliera prevista', hi: 'औसत दैनिक पूर्वानुमान', ur: 'اوسط روزانہ پیش گوئی', ja: '1日あたり平均予測', zh: '平均每日预测' },
  perDayCurrent: { en: 'm³/day · current {avg}', ar: 'م³/يوم · الحالي {avg}', ru: 'м³/день · сейчас {avg}', de: 'm³/Tag · aktuell {avg}', it: 'm³/giorno · attuale {avg}', hi: 'm³/दिन · वर्तमान {avg}', ur: 'm³/دن · موجودہ {avg}', ja: 'm³/日 · 現在 {avg}', zh: 'm³/天 · 当前 {avg}' },
  peakDay: { en: 'Peak demand day', ar: 'أعلى يوم طلب', ru: 'День пикового спроса', de: 'Tag mit Spitzennachfrage', it: 'Giorno di picco della domanda', hi: 'सबसे अधिक मांग वाला दिन', ur: 'سب سے زیادہ مانگ کا دن', ja: '需要ピーク日', zh: '需求高峰日' },
  daySun: { en: 'Sunday', ar: 'الأحد', ru: 'Воскресенье', de: 'Sonntag', it: 'Domenica', hi: 'रविवार', ur: 'اتوار', ja: '日曜日', zh: '星期日' },
  dayMon: { en: 'Monday', ar: 'الإثنين', ru: 'Понедельник', de: 'Montag', it: 'Lunedì', hi: 'सोमवार', ur: 'پیر', ja: '月曜日', zh: '星期一' },
  dayTue: { en: 'Tuesday', ar: 'الثلاثاء', ru: 'Вторник', de: 'Dienstag', it: 'Martedì', hi: 'मंगलवार', ur: 'منگل', ja: '火曜日', zh: '星期二' },
  dayWed: { en: 'Wednesday', ar: 'الأربعاء', ru: 'Среда', de: 'Mittwoch', it: 'Mercoledì', hi: 'बुधवार', ur: 'بدھ', ja: '水曜日', zh: '星期三' },
  dayThu: { en: 'Thursday', ar: 'الخميس', ru: 'Четверг', de: 'Donnerstag', it: 'Giovedì', hi: 'गुरुवार', ur: 'جمعرات', ja: '木曜日', zh: '星期四' },
  dayFri: { en: 'Friday', ar: 'الجمعة', ru: 'Пятница', de: 'Freitag', it: 'Venerdì', hi: 'शुक्रवार', ur: 'جمعہ', ja: '金曜日', zh: '星期五' },
  daySat: { en: 'Saturday', ar: 'السبت', ru: 'Суббота', de: 'Samstag', it: 'Sabato', hi: 'शनिवार', ur: 'ہفتہ', ja: '土曜日', zh: '星期六' },
  peakPrep: { en: 'Prepare extra stock', ar: 'جهّز مخزون إضافي', ru: 'Подготовьте дополнительный запас', de: 'Zusätzlichen Bestand vorbereiten', it: 'Prepara scorte extra', hi: 'अतिरिक्त स्टॉक तैयार करें', ur: 'اضافی اسٹاک تیار کریں', ja: '追加在庫を準備', zh: '准备额外库存' },
  accuracyTitle: { en: 'Forecast accuracy', ar: 'دقة التوقع', ru: 'Точность прогноза', de: 'Prognosegenauigkeit', it: 'Precisione della previsione', hi: 'पूर्वानुमान सटीकता', ur: 'پیش گوئی کی درستگی', ja: '予測精度', zh: '预测准确度' },
  confHigh: { en: 'High', ar: 'عالية', ru: 'Высокая', de: 'Hoch', it: 'Alta', hi: 'उच्च', ur: 'اعلی', ja: '高い', zh: '高' },
  confMedium: { en: 'Medium', ar: 'متوسطة', ru: 'Средняя', de: 'Mittel', it: 'Media', hi: 'मध्यम', ur: 'درمیانی', ja: '中', zh: '中' },
  confLow: { en: 'Low', ar: 'منخفضة', ru: 'Низкая', de: 'Niedrig', it: 'Bassa', hi: 'निम्न', ur: 'کم', ja: '低い', zh: '低' },
  samplesDays: { en: '{n} days of actual data', ar: '{n} يوم بيانات فعلية', ru: '{n} дней фактических данных', de: '{n} Tage mit echten Daten', it: '{n} giorni di dati reali', hi: '{n} दिनों का वास्तविक डेटा', ur: '{n} دن کا حقیقی ڈیٹا', ja: '{n}日分の実データ', zh: '{n} 天的实际数据' },
  materialsNeeded: { en: 'Materials required to cover the forecasted demand', ar: 'الخامات المطلوبة لتغطية الطلب المتوقع', ru: 'Материалы, необходимые для покрытия прогнозируемого спроса', de: 'Benötigte Materialien zur Deckung der prognostizierten Nachfrage', it: 'Materiali necessari per coprire la domanda prevista', hi: 'अनुमानित मांग को पूरा करने के लिए आवश्यक सामग्री', ur: 'متوقع مانگ پوری کرنے کے لیے درکار مواد', ja: '予測需要に対応するための必要材料', zh: '满足预测需求所需材料' },
  matCement: { en: 'Cement', ar: 'أسمنت', ru: 'Цемент', de: 'Zement', it: 'Cemento', hi: 'सीमेंट', ur: 'سیمنٹ', ja: 'セメント', zh: '水泥' },
  matSand: { en: 'Sand', ar: 'رمل', ru: 'Песок', de: 'Sand', it: 'Sabbia', hi: 'रेत', ur: 'ریت', ja: '砂', zh: '砂' },
  matGravel: { en: 'Gravel', ar: 'زلط', ru: 'Гравий', de: 'Kies', it: 'Ghiaia', hi: 'बजरी', ur: 'بجری', ja: '砂利', zh: '砾石' },
  matAdmix: { en: 'Admixture', ar: 'إضافات', ru: 'Добавки', de: 'Zusatzmittel', it: 'Additivi', hi: 'एडमिक्सर', ur: 'ایڈمیچر', ja: '混和剤', zh: '外加剂' },
  tonUnit: { en: 'ton', ar: 'طن', ru: 'т', de: 't', it: 't', hi: 'टन', ur: 'ٹن', ja: 'トン', zh: '吨' },
  literUnit: { en: 'L', ar: 'لتر', ru: 'л', de: 'l', it: 'l', hi: 'लीटर', ur: 'لٹر', ja: 'L', zh: '升' },
  tip: { en: '💡 It is recommended to issue supply orders to cover the shortage before the peak season · total of 90 actual days: {total} m³', ar: '💡 يُنصح بإصدار أوامر توريد لتغطية النقص قبل موسم الذروة · إجمالي 90 يوم فعل: {total} م³', ru: '💡 Рекомендуется оформлять заказы на поставку для покрытия дефицита до пикового сезона · всего за 90 факт. дней: {total} м³', de: '💡 Es wird empfohlen, Bestellungen zur Deckung des Engpasses vor der Hauptsaison aufzugeben · gesamt 90 echte Tage: {total} m³', it: '💡 Si consiglia di emettere ordini di fornitura per coprire la carenza prima del picco stagionale · totale 90 giorni reali: {total} m³', hi: '💡 पीक सीज़न से पहले कमी को पूरा करने के लिए आपूर्ति ऑर्डर जारी करने की सलाह दी जाती है · कुल 90 वास्तविक दिन: {total} m³', ur: '💡 پیک سیزن سے پہلے کمی پوری کرنے کے لیے سپلائی آرڈرز جاری کرنے کی سفارش کی جاتی ہے · کل 90 حقیقی دن: {total} m³', ja: '💡 需要ピーク前に不足を補う供給注文を発行することを推奨します · 実績90日合計: {total} m³', zh: '💡 建议在旺季前发出供货订单以弥补短缺 · 90 天实际总计：{total} m³' },
};

export function useDemandForecastDict() {
  return usePageDict(DICT);
}