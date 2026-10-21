import { usePageDict, type PageDict } from './pageDict';

export function useSalesDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  // Main page
  salesTitle: { en: '📊 Daily Sales Schedule', ar: '📊 جدول المبيعات اليومي', ru: '📊 Ежедневное расписание продаж', de: '📊 Täglicher Verkaufsplan', it: '📊 Programma vendite giornaliero', hi: '📊 दैनिक बिक्री अनुसूची', ur: '📆 روزانہ سیلز شیڈول', ja: '📊 日次販売スケジュール', zh: '📊 每日销售计划' },
  subtitle: { en: 'Daily schedule for blocks & concrete — planned vs executed', ar: 'جدول اليوم للبلوك والخرسانة — المخطط مقابل المنفذ', ru: 'Расписание на сегодня для блоков и бетона — план vs факт', de: 'Heutiger Plan für Blöcke & Beton — geplant vs ausgeführt', it: 'Piano di oggi per blocchi e calcestruzzo — pianificato vs eseguito', hi: 'आज का ब्लॉक और कंक्रीट का शेड्यूल — योजना बनाम निष्पादित', ur: 'آج کا بلیک اور کنکریٹ کا شیڈول — منصوبہ برآمدہ مقابلہ نفاذ', ja: '今日のブロックとコンクリートのスケジュール — 計画対実績', zh: '今日砌块和混凝土的计划 — 计划对比执行' },
  
  // Tabs
  tabBlocks: { en: '🧱 Blocks', ar: '🧱 البلوك', ru: '🧱 Блоки', de: '🧱 Blöcke', it: '🧱 Blocchi', hi: '🧱 ब्लॉक', ur: '🧱 بلیک', ja: '🧱 ブロック', zh: '🧱 砌块' },
  tabConcrete: { en: '🏗️ Concrete', ar: '🏗️ الخرسانة', ru: '🏗️ Бетон', de: '🏗️ Beton', it: '🏗️ Calcestruzzo', hi: '🏗️ कंक्रीट', ur: '🏗️ کنکریٹ', ja: '🏗️ コンクリート', zh: '🏗️ 混凝土' },
  tabSchedule: { en: '📅 Today\'s Schedule', ar: '📅 جدول اليوم', ru: '📅 Расписание на сегодня', de: '📅 Heutiger Plan', it: '📅 Piano di oggi', hi: '📅 आज का शेड्यूल', ur: '📅 آج کا شیڈول', ja: '📅 今日のスケジュール', zh: '📅 今日计划' },
  
  // Sections
  plannedOrders: { en: '📋 Planned Orders', ar: '📋 الطلبات المخططة', ru: '📋 Планируемые заказы', de: '📋 Geplante Aufträge', it: '📋 Ordini pianificati', hi: '📋 योजनाबद्ध ऑर्डर', ur: '📋 منصوبہ بندہ آرڈرز', ja: '📋 計画注文', zh: '📋 计划订单' },
  executedOrders: { en: '✅ Executed Today', ar: '✅ المنفذ اليوم', ru: '✅ Выполнено сегодня', de: '✅ Heute ausgeführt', it: '✅ Eseguito oggi', hi: '✅ आज निष्पादित', ur: '✅ آج نافذ', ja: '✅ 本日実行', zh: '✅ 今日执行' },
  executedBlocks: { en: '✅ Blocks Executed', ar: '✅ البلوك المنفذ', ru: '✅ Выполненные блоки', de: '✅ Ausgeführte Blöcke', it: '✅ Blocchi eseguiti', hi: '✅ निष्पादित ब्लॉक', ur: '✅ نافذ بلیک', ja: '✅ 実行済みブロック', zh: '✅ 已执行砌块' },
  executedConcrete: { en: '✅ Concrete Executed', ar: '✅ الخرسانة المنفذة', ru: '✅ Выполненный бетон', de: '✅ Ausgeführter Beton', it: '✅ Calcestruzzo eseguito', hi: '✅ निष्पादित कंक्रीट', ur: '✅ نافذ کنکریٹ', ja: '✅ 実行済みコンクリート', zh: '✅ 已执行混凝土' },
  
  // Summary cards
  totalPlanned: { en: '📦 Total Planned', ar: '📦 إجمالي المخطط', ru: '📦 Всего запланировано', de: '📦 Gesamt geplant', it: '📦 Totale pianificato', hi: '📦 कुल योजनाबद्ध', ur: '📦 کل منصوبہ', ja: '📦 総計画', zh: '📦 总计划' },
  totalExecuted: { en: '✅ Total Executed', ar: '✅ إجمالي المنفذ', ru: '✅ Всего выполнено', de: '✅ Gesamt ausgeführt', it: '✅ Totale eseguito', hi: '✅ कुल निष्पादित', ur: '✅ کل نفاذ', ja: '✅ 総実行', zh: '✅ 总执行' },
  remaining: { en: '⏳ Remaining', ar: '⏳ المتبقي', ru: '⏳ Осталось', de: '⏳ Verbleibend', it: '⏳ Rimanente', hi: '⏳ शेष', ur: '⏳ باقی', ja: '⏳ 残り', zh: '⏳ 剩余' },
  completionRate: { en: '📈 Completion Rate', ar: '📈 معدل التنفيذ', ru: '📈 Процент выполнения', de: '📈 Ausführungsrate', it: '📈 Tasso di esecuzione', hi: '📈 निष्पादन दर', ur: '📈 نفاذ کی شرح', ja: '📈 実行率', zh: '📈 执行率' },
  
  // Table columns
  orderNo: { en: 'Order No.', ar: 'رقم الطلب', ru: 'Номер заказа', de: 'Auftrags-Nr.', it: 'N. ordine', hi: 'ऑर्डर नं.', ur: 'آرڈر نمبر', ja: '注文番号', zh: '订单号' },
  customer: { en: 'Customer', ar: 'العميل', ru: 'Клиент', de: 'Kunde', it: 'Cliente', hi: 'ग्राहक', ur: 'گاہک', ja: '顧客', zh: '客户' },
  project: { en: 'Project', ar: 'المشروع', ru: 'Проект', de: 'Projekt', it: 'Progetto', hi: 'प्रोजेक्ट', ur: 'پروجیکٹ', ja: 'プロジェクト', zh: '项目' },
  location: { en: 'Location', ar: 'الموقع', ru: 'Местоположение', de: 'Standort', it: 'Posizione', hi: 'स्थान', ur: 'موقع', ja: '場所', zh: '地点' },
  qty: { en: 'Qty', ar: 'الكمية', ru: 'Кол-во', de: 'Menge', it: 'Qtà', hi: 'मात्रा', ur: 'مقدار', ja: '数量', zh: '数量' },
  unit: { en: 'Unit', ar: 'الوحدة', ru: 'Ед. изм.', de: 'Einheit', it: 'Unità', hi: 'इकाई', ur: ' اکائی', ja: '単位', zh: '单位' },
  m3: { en: 'm³', ar: 'م³', ru: 'м³', de: 'm³', it: 'm³', hi: 'm³', ur: 'م³', ja: 'm³', zh: 'm³' },
  blocks: { en: 'blocks', ar: 'بلوك', ru: 'блоки', de: 'Blöcke', it: 'blocchi', hi: 'ब्लॉक', ur: 'بلاک', ja: 'ブロック', zh: '砌块' },
  strength: { en: 'Strength', ar: 'القوة', ru: 'Прочность', de: 'Festigkeit', it: 'Resistenza', hi: 'ताकत', ur: 'طاقت', ja: '強度', zh: '强度' },
  scheduledTime: { en: 'Scheduled Time', ar: 'وقت المجدول', ru: 'Запланированное время', de: 'Geplante Zeit', it: 'Ora programmata', hi: 'निर्धारित समय', ur: 'مقررہ وقت', ja: '予定時刻', zh: '计划时间' },
  executedTime: { en: 'Executed Time', ar: 'وقت التنفيذ', ru: 'Время выполнения', de: 'Ausführungszeit', it: 'Ora esecuzione', hi: 'निष्पादन समय', ur: 'نفاذ کا وقت', ja: '実行時刻', zh: '执行时间' },
  status: { en: 'Status', ar: 'الحالة', ru: 'Статус', de: 'Status', it: 'Stato', hi: 'स्थिति', ur: 'حالت', ja: 'ステータス', zh: '状态' },
  actions: { en: 'Actions', ar: 'الإجراءات', ru: 'Действия', de: 'Aktionen', it: 'Azioni', hi: 'कार्य', ur: 'اعمال', ja: '操作', zh: '操作' },
  
  // Status values
  statusPending: { en: '⏳ Pending', ar: '⏳ قيد الانتظار', ru: '⏳ В ожидании', de: '⏳ Ausstehend', it: '⏳ In attesa', hi: '⏳ लंबित', ur: '⏳ تحت التواء', ja: '⏳ 保留中', zh: '⏳ 待处理' },
  statusScheduled: { en: '📅 Scheduled', ar: '📅 مجدول', ru: '📅 Запланировано', de: '📅 Geplant', it: '📅 Programmato', hi: '📅 अनुसूचित', ur: '📅 مقرر', ja: '📅 予定済み', zh: '📅 已排程' },
  statusInProgress: { en: '🚚 In Progress', ar: '🚚 قيد التنفيذ', ru: '🚚 В процессе', de: '🚚 In Bearbeitung', it: '🚚 In corso', hi: '🚚 प्रगति पर', ur: '🚚 جاری', ja: '🚚 進行中', zh: '🚚 进行中' },
  statusCompleted: { en: '✅ Completed', ar: '✅ مكتمل', ru: '✅ Завершено', de: '✅ Abgeschlossen', it: '✅ Completato', hi: '✅ पूर्ण', ur: '✅ مکمل', ja: '✅ 完了', zh: '✅ 已完成' },
  statusCancelled: { en: '❌ Cancelled', ar: '❌ ملغي', ru: '❌ Отменено', de: '❌ Abgebrochen', it: '❌ Annullato', hi: '❌ रद्द', ur: '❌ منسوخ', ja: '❌ キャンセル', zh: '❌ 已取消' },
  statusExecuted: { en: '✅ Executed', ar: '✅ منفذ', ru: '✅ Выполнено', de: '✅ Ausgeführt', it: '✅ Eseguito', hi: '✅ निष्पादित', ur: '✅ نافذ', ja: '✅ 実行済み', zh: '✅ 已执行' },
  
  // Actions
  markExecuted: { en: '✅ Mark Executed', ar: '✅ وسم كمنفذ', ru: '✅ Отметить выполненным', de: '✅ Als ausgeführt markieren', it: '✅ Segna come eseguito', hi: '✅ निष्पादित के रूप में चिह्नित', ur: '✅ نفاذ کے طور پر نشان لگانے', ja: '✅ 実行済みにする', zh: '✅ 标记为已执行' },
  undoExecuted: { en: '↩️ Undo', ar: '↩️ تراجع', ru: '↩️ Отменить', de: '↩️ Rückgängig', it: '↩️ Annulla', hi: '↩️ पूर्ववत करें', ur: '↩️ واپس لیں', ja: '↩️ 元に戻す', zh: '↩️ 撤销' },
  
  // Date
  selectDate: { en: '📅 Select Date', ar: '📅 اختر التاريخ', ru: '📅 Выберите дату', de: '📅 Datum wählen', it: '📅 Seleziona data', hi: '📅 तारीख चुनें', ur: '📅 تاریخ منتخب کریں', ja: '📅 日付を選択', zh: '📅 选择日期' },
  today: { en: 'Today', ar: 'اليوم', ru: 'Сегодня', de: 'Heute', it: 'Oggi', hi: 'आज', ur: 'آج', ja: '今日', zh: '今天' },
  yesterday: { en: 'Yesterday', ar: 'أمس', ru: 'Вчера', de: 'Gestern', it: 'Ieri', hi: 'कल', ur: 'کل', ja: '昨日', zh: '昨天' },
  
  // Summary
  blocksTotal: { en: '🧱 Blocks', ar: '🧱 البلوك', ru: '🧱 Блоки', de: '🧱 Blöcke', it: '🧱 Blocchi', hi: '🧱 ब्लॉक', ur: '🧱 بلیک', ja: '🧱 ブロック', zh: '🧱 砌块' },
  concreteTotal: { en: '🏗️ Concrete', ar: '🏗️ الخرسانة', ru: '🏗️ Бетон', de: '🏗️ Beton', it: '🏗️ Calcestruzzo', hi: '🏗️ कंक्रीट', ur: '🏗️ کنکریٹ', ja: '🏗️ コンクリート', zh: '🏗️ 混凝土' },
  
  // Empty states
  noPlanned: { en: 'No planned orders for this date', ar: 'لا توجد طلبات مخططة لهذا التاريخ', ru: 'Нет запланированных заказов на эту дату', de: 'Keine geplanten Aufträge für dieses Datum', it: 'Nessun ordine pianificato per questa data', hi: 'इस तारीख के लिए कोई योजनाबद्ध ऑर्डर नहीं', ur: 'اس تاریخ کے لیے کوئی منصوبہ بندہ آرڈر نہیں', ja: 'この日付の計画注文はありません', zh: '此日期无计划订单' },
  noExecuted: { en: 'No orders executed yet today', ar: 'لم يتم تنفيذ أي طلبات اليوم بعد', ru: 'Сегодня еще не выполнено ни одного заказа', de: 'Heute noch keine Aufträge ausgeführt', it: 'Nessun ordine eseguito oggi', hi: 'आज अभी तक कोई ऑर्डर निष्पादित नहीं', ur: 'آج ابھی تک کوئی آرڈر نافذ نہیں ہوا', ja: '今日はまだ注文が実行されていません', zh: '今日暂无执行订单' },
  
  // Concrete specific
  concreteStrength: { en: 'Strength', ar: 'القوة', ru: 'Прочность', de: 'Festigkeit', it: 'Resistenza', hi: 'ताकत', ur: 'طاقت', ja: '強度', zh: '强度' },
  slump: { en: 'Slump (cm)', ar: 'الهبوط (سم)', ru: 'Слумп (см)', de: 'Slump (cm)', it: 'Slump (cm)', hi: 'स्लम्प (सेमी)', ur: 'اسلپ (سم)', ja: 'スランプ (cm)', zh: '坍落度 (cm)' },
  cementType: { en: 'Cement', ar: 'الأسمنت', ru: 'Цемент', de: 'Zement', it: 'Cemento', hi: 'सीमेंट', ur: 'سیمنٹ', ja: 'セメント', zh: '水泥' },
  
  // Buttons
  refresh: { en: '🔄 Refresh', ar: '🔄 تحديث', ru: '🔄 Обновить', de: '🔄 Aktualisieren', it: '🔄 Aggiorna', hi: '🔄 रीफ्रेश', ur: '🔄 تازہ کریں', ja: '🔄 更新', zh: '🔄 刷新' },
  export: { en: '📥 Export', ar: '📥 تصدير', ru: '📥 Экспорт', de: '📥 Exportieren', it: '📥 Esporta', hi: '📥 निर्यात', ur: '📥 برآمد کریں', ja: '📥 エクスポート', zh: '📥 导出' },
  
  // Export button labels
  exportExcel: { en: '📊 Excel', ar: '📊 إكسل', ru: '📊 Excel', de: '📊 Excel', it: '📊 Excel', hi: '📊 एक्सेल', ur: '📊 ایکسل', ja: '📊 Excel', zh: '📊 Excel' },
  exportCsv: { en: '📄 CSV', ar: '📄 CSV', ru: '📄 CSV', de: '📄 CSV', it: '📄 CSV', hi: '📄 CSV', ur: '📄 CSV', ja: '📄 CSV', zh: '📄 CSV' },
  exportPdf: { en: '🖨️ PDF', ar: '🖨️ PDF', ru: '🖨️ PDF', de: '🖨️ PDF', it: '🖨️ PDF', hi: '🖨️ PDF', ur: '🖨️ PDF', ja: '🖨️ PDF', zh: '🖨️ PDF' },
  days: { en: 'days', ar: 'أيام', ru: 'дней', de: 'Tage', it: 'giorni', hi: 'दिन', ur: 'دن', ja: '日', zh: '天' },
  daysCoverage: { en: 'days coverage', ar: 'أيام التغطية', ru: 'дней покрытия', de: 'Tage Abdeckung', it: 'giorni di copertura', hi: 'दिन कवरेज', ur: 'دن کی کوریج', ja: 'カバレッジ日数', zh: '覆盖天数' },
  allGood: { en: 'All good', ar: 'كل شيء على ما يرام', ru: 'Всё хорошо', de: 'Alles gut', it: 'Tutto bene', hi: 'सब ठीक है', ur: 'سب ٹھیک ہے', ja: '全て良好', zh: '一切正常' },
};