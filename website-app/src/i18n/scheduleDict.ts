import { usePageDict, type PageDict } from './pageDict';

export function useScheduleDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  scBackLogin: { en: 'Back to Login', ar: 'عودة للدخول', ru: 'Back to Login', de: 'Back to Login', it: 'Back to Login', hi: 'Back to Login', ur: 'Back to Login', ja: 'Back to Login', zh: 'Back to Login' },
  scCat: { en: 'Cat', ar: 'الفئة', ru: 'Cat', de: 'Cat', it: 'Cat', hi: 'Cat', ur: 'Cat', ja: 'Cat', zh: 'Cat' },
  scCode: { en: 'Code', ar: 'الكود', ru: 'Code', de: 'Code', it: 'Code', hi: 'Code', ur: 'Code', ja: 'Code', zh: 'Code' },
  scConcrete: { en: 'Concrete', ar: 'خرسانة', ru: 'Concrete', de: 'Concrete', it: 'Concrete', hi: 'Concrete', ur: 'Concrete', ja: 'Concrete', zh: 'Concrete' },
  scCustomer: { en: 'Customer', ar: 'العميل', ru: 'Customer', de: 'Customer', it: 'Customer', hi: 'Customer', ur: 'Customer', ja: 'Customer', zh: 'Customer' },
  scDistance: { en: 'Distance', ar: 'المسافة', ru: 'Distance', de: 'Distance', it: 'Distance', hi: 'Distance', ur: 'Distance', ja: 'Distance', zh: 'Distance' },
  scDesigner: { en: 'Dr. Ahmad Abdo Alyan', ar: 'د. أحمد عبده عليان', ru: 'Dr. Ahmad Abdo Alyan', de: 'Dr. Ahmad Abdo Alyan', it: 'Dr. Ahmad Abdo Alyan', hi: 'Dr. Ahmad Abdo Alyan', ur: 'Dr. Ahmad Abdo Alyan', ja: 'Dr. Ahmad Abdo Alyan', zh: 'Dr. Ahmad Abdo Alyan' },
  scDuration: { en: 'Duration', ar: 'المدة', ru: 'Duration', de: 'Duration', it: 'Duration', hi: 'Duration', ur: 'Duration', ja: 'Duration', zh: 'Duration' },
  scElement: { en: 'Element', ar: 'العنصر', ru: 'Element', de: 'Element', it: 'Element', hi: 'Element', ur: 'Element', ja: 'Element', zh: 'Element' },
  scPay: { en: 'Pay', ar: 'الدفع', ru: 'Pay', de: 'Pay', it: 'Pay', hi: 'Pay', ur: 'Pay', ja: 'Pay', zh: 'Pay' },
  scPhone: { en: 'Phone', ar: 'الهاتف', ru: 'Phone', de: 'Phone', it: 'Phone', hi: 'Phone', ur: 'Phone', ja: 'Phone', zh: 'Phone' },
  scPrio: { en: 'Prio', ar: 'الأولوية', ru: 'Prio', de: 'Prio', it: 'Prio', hi: 'Prio', ur: 'Prio', ja: 'Prio', zh: 'Prio' },
  scProject: { en: 'Project', ar: 'المشروع', ru: 'Project', de: 'Project', it: 'Project', hi: 'Project', ur: 'Project', ja: 'Project', zh: 'Project' },
  scQty: { en: 'Qty', ar: 'الكمية', ru: 'Qty', de: 'Qty', it: 'Qty', hi: 'Qty', ur: 'Qty', ja: 'Qty', zh: 'Qty' },
  scSlump: { en: 'Slump', ar: 'الهبوط', ru: 'Slump', de: 'Slump', it: 'Slump', hi: 'Slump', ur: 'Slump', ja: 'Slump', zh: 'Slump' },
  scTime: { en: 'Time', ar: 'الوقت', ru: 'Time', de: 'Time', it: 'Time', hi: 'Time', ur: 'Time', ja: 'Time', zh: 'Time' },
  scType: { en: 'Type', ar: 'النوع', ru: 'Type', de: 'Type', it: 'Type', hi: 'Type', ur: 'Type', ja: 'Type', zh: 'Type' },

  logout: { en: 'Logout', ar: '🚪 خروج', ru: 'Выход', de: 'Abmelden', it: 'Esci', hi: 'लॉग आउट', ur: 'لاگ آؤٹ', ja: 'ログアウト', zh: '退出' },
  orders: { en: 'Orders', ar: 'الطلبات', ru: 'Заказы', de: 'Bestellungen', it: 'Ordini', hi: 'ऑर्डर', ur: 'آرڈرز', ja: '注文', zh: '订单' },
  noOrdersInSystem: { en: 'No orders in the system', ar: 'لا توجد طلبات في النظام', ru: 'В системе нет заказов', de: 'Keine Bestellungen im System', it: 'Nessun ordine nel sistema', hi: 'सिस्टम में कोई ऑर्डर नहीं', ur: 'سسٹم میں کوئی آرڈر نہیں', ja: 'システムに注文がありません', zh: '系统中没有订单' },
  noApprovedToImport: { en: 'No approved orders available for import', ar: 'لا توجد طلبات موافق عليها ومتاحة للاستيراد', ru: 'Нет одобренных заказов для импорта', de: 'Keine genehmigten Bestellungen zum Importieren verfügbar', it: 'Nessun ordine approvato disponibile per l\'importazione', hi: 'आयात के लिए कोई अनुमोदित ऑर्डर उपलब्ध नहीं', ur: 'درآمد کے لیے کوئی منظور شدہ آرڈر دستیاب نہیں', ja: 'インポート可能な承認済み注文がありません', zh: '没有可导入的已批准订单' },
  allOrdersInSchedule: { en: 'All orders are already in the schedule', ar: 'جميع الطلبات موجودة بالفعل في الجدول', ru: 'Все заказы уже находятся в расписании', de: 'Alle Bestellungen sind bereits im Zeitplan', it: 'Tutti gli ordini sono già nel programma', hi: 'सभी ऑर्डर पहले से ही शेड्यूल में हैं', ur: 'تمام آرڈرز پہلے سے ہی شیڈول میں موجود ہیں', ja: 'すべての注文はすでにスケジュールに含まれています', zh: '所有订单都已在排程中' },
  importSuccessPrefix: { en: 'Imported ', ar: 'تم استيراد ', ru: 'Импортировано ', de: 'Importiert ', it: 'Importati ', hi: 'आयात किए गए ', ur: 'درآمد کیے گئے ', ja: 'インポートしました（', zh: '已导入 ' },
  importSuccessSuffix: { en: ' order(s) successfully', ar: ' طلب(ات) بنجاح', ru: ' заказ(ов) успешно', de: ' Bestellung(en) erfolgreich', it: ' ordine/i con successo', hi: ' ऑर्डर सफलतापूर्वक', ur: ' آرڈرز کامیابی سے', ja: '件）', zh: ' 个订单' },
  fromOrders: { en: 'Import from orders', ar: 'Import من الطلبات', ru: 'Импорт из заказов', de: 'Import aus Bestellungen', it: 'Importa dagli ordini', hi: 'ऑर्डर से आयात', ur: 'آرڈرز سے امپورٹ', ja: '注文からインポート', zh: '从订单导入' },
  importModalTitle: { en: '📦 Import from orders', ar: '📦 استيراد من الطلبات', ru: '📦 Импорт из заказов', de: '📦 Import aus Bestellungen', it: '📦 Importa dagli ordini', hi: '📦 ऑर्डर से आयात', ur: '📦 آرڈرز سے درآمد', ja: '📦 注文からインポート', zh: '📦 从订单导入' },
  chooseImportType: { en: 'Choose import type:', ar: 'اختر نوع الاستيراد:', ru: 'Выберите тип импорта:', de: 'Importtyp wählen:', it: 'Scegli il tipo di importazione:', hi: 'आयात प्रकार चुनें:', ur: 'درآمد کی قسم منتخب کریں:', ja: 'インポートの種類を選択：', zh: '选择导入类型：' },
  importAllApproved: { en: '✅ Import all approved orders', ar: '✅ استيراد جميع الطلبات الموافق عليها', ru: '✅ Импортировать все одобренные заказы', de: '✅ Alle genehmigten Bestellungen importieren', it: '✅ Importa tutti gli ordini approvati', hi: '✅ सभी अनुमोदित ऑर्डर आयात करें', ur: '✅ تمام منظور شدہ آرڈرز درآمد کریں', ja: '✅ 承認済みの全注文をインポート', zh: '✅ 导入所有已批准的订单' },
  importScheduledOnly: { en: '📅 Import scheduled orders only', ar: '📅 استيراد الطلبات المجدولة فقط', ru: '📅 Импортировать только запланированные заказы', de: '📅 Nur geplante Bestellungen importieren', it: '📅 Importa solo ordini programmati', hi: '📅 केवल निर्धारित ऑर्डर आयात करें', ur: '📅 صرف شیڈول شدہ آرڈرز درآمد کریں', ja: '📅 スケジュール済みの注文のみをインポート', zh: '📅 仅导入已排程的订单' },
  importNoteLabel: { en: 'Note:', ar: 'ملاحظة:', ru: 'Примечание:', de: 'Hinweis:', it: 'Nota:', hi: 'नोट:', ur: 'نوٹ:', ja: '注：', zh: '注意：' },
  importNoteBody: { en: 'Only orders approved from the accounts and not under any block will be imported.', ar: 'سيتم استيراد فقط الطلبات التي تم الموافقة عليها من الحسابات وليس عليها حظر.', ru: 'Будут импортированы только заказы, одобренные из аккаунтов и не находящиеся под блокировкой.', de: 'Es werden nur Bestellungen importiert, die von den Konten genehmigt wurden und nicht gesperrt sind.', it: 'Verranno importati solo gli ordini approvati dagli account e non soggetti a blocco.', hi: 'केवल वे ऑर्डर आयात किए जाएँगे जो खातों से अनुमोदित हैं और ब्लॉक के अधीन नहीं हैं।', ur: 'صرف وہ آرڈرز درآمد کیے جائیں گے جو اکاؤنٹس سے منظور شدہ ہوں اور ان پر کوئی پابندی نہ ہو۔', ja: 'アカウントから承認され、ブロックされていない注文のみがインポートされます。', zh: '仅导入已由账户批准且未受封锁的订单。' },
  cancel: { en: '❌ Cancel', ar: '❌ إلغاء', ru: '❌ Отмена', de: '❌ Abbrechen', it: '❌ Annulla', hi: '❌ रद्द करें', ur: '❌ منسوخ کریں', ja: '❌ キャンセル', zh: '❌ 取消' },
};