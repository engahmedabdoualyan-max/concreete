import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  alertMissing: { en: 'Please enter the customer name and phone number', ar: 'يرجى إدخال اسم العميل ورقم الهاتف', ru: 'Введите имя клиента и номер телефона', de: 'Bitte geben Sie den Kundennamen und die Telefonnummer ein', it: 'Inserisci nome del cliente e numero di telefono', hi: 'कृपया ग्राहक का नाम और फ़ोन नंबर दर्ज करें', ur: 'براہ کرم صارف کا نام اور فون نمبر درج کریں', ja: '顧客名と電話番号を入力してください', zh: '请输入客户姓名和电话号码' },
  confirmDelete: { en: 'Delete this customer?', ar: 'حذف هذا العميل؟', ru: 'Удалить этого клиента?', de: 'Diesen Kunden löschen?', it: 'Eliminare questo cliente?', hi: 'इस ग्राहक को हटाएँ?', ur: 'اس صارف کو حذف کریں؟', ja: 'この顧客を削除しますか？', zh: '删除此客户？' },
  noneFound: { en: 'No customers yet — add a new customer to start orders.', ar: 'لا يوجد عملاء بعد — أضف عميلاً جديداً لبدء الطلبات.', ru: 'Пока нет клиентов — добавьте нового клиента, чтобы начать заказы.', de: 'Noch keine Kunden — fügen Sie einen neuen Kunden hinzu, um Bestellungen zu starten.', it: 'Nessun cliente ancora — aggiungi un nuovo cliente per iniziare gli ordini.', hi: 'अभी कोई ग्राहक नहीं — ऑर्डर शुरू करने के लिए नया ग्राहक जोड़ें।', ur: 'ابھی کوئی صارف نہیں — آرڈرز شروع کرنے کے لیے نیا صارف شامل کریں۔', ja: 'まだ顧客がいません — 注文を始めるには新しい顧客を追加してください。', zh: '暂无客户 — 添加新客户以开始下单。' },
  unFreeze: { en: 'Unfreeze credit', ar: 'فك التجميد', ru: 'Разморозить кредит', de: 'Kredit freigeben', it: 'Sblocca credito', hi: 'क्रेडिट अनफ़्रीज़ करें', ur: 'کریڈٹ ان فریز کریں', ja: '与信解除', zh: '解除信用冻结' },
  freezeCredit: { en: 'Credit hold', ar: 'تجميد ائتماني', ru: 'Заморозить кредит', de: 'Kredit sperren', it: 'Blocca credito', hi: 'क्रेडिट होल्ड', ur: 'کریڈٹ ہولڈ', ja: '与信停止', zh: '信用冻结' },
  unholdBtn: { en: '🔓 Release hold', ar: '🔓 فك الحجز', ru: '🔓 Снять блокировку', de: '🔓 Sperre aufheben', it: '🔓 Rilascia blocco', hi: '🔓 होल्ड जारी करें', ur: '🔓 ہولڈ ختم کریں', ja: '🔓 解除停止', zh: '🔓 解除冻结' },
  selectBtn: { en: 'Select', ar: 'اختر', ru: 'Выбрать', de: 'Auswählen', it: 'Seleziona', hi: 'चुनें', ur: 'منتخب کریں', ja: '選択', zh: '选择' },
  newCustomer: { en: '👤 New customer (auto: {code})', ar: '👤 عميل جديد (تلقائياً: {code})', ru: '👤 Новый клиент (автоматически: {code})', de: '👤 Neuer Kunde (automatisch: {code})', it: '👤 Nuovo cliente (automatico: {code})', hi: '👤 नया ग्राहक (स्वचालित: {code})', ur: '👤 نیا صارف (خودکار: {code})', ja: '👤 新規顧客（自動: {code}）', zh: '👤 新客户（自动：{code}）' },
  namePh: { en: 'Customer name *', ar: 'اسم العميل *', ru: 'Имя клиента *', de: 'Kundenname *', it: 'Nome cliente *', hi: 'ग्राहक का नाम *', ur: 'صارف کا نام *', ja: '顧客名 *', zh: '客户姓名 *' },
  phonePh: { en: 'Phone number *', ar: 'رقم الهاتف *', ru: 'Номер телефона *', de: 'Telefonnummer *', it: 'Numero di telefono *', hi: 'फ़ोन नंबर *', ur: 'فون نمبر *', ja: '電話番号 *', zh: '电话号码 *' },
  addressPh: { en: 'Address (optional)', ar: 'العنوان (اختياري)', ru: 'Адрес (необязательно)', de: 'Adresse (optional)', it: 'Indirizzo (opzionale)', hi: 'पता (वैकल्पिक)', ur: 'پتہ (اختیاری)', ja: '住所（任意）', zh: '地址（可选）' },
  saveCustomer: { en: '💾 Save customer', ar: '💾 حفظ العميل', ru: '💾 Сохранить клиента', de: '💾 Kunden speichern', it: '💾 Salva cliente', hi: '💾 ग्राहक सहेजें', ur: '💾 صارف محفوظ کریں', ja: '💾 顧客を保存', zh: '💾 保存客户' },
  cancelBtn: { en: 'Cancel', ar: 'إلغاء', ru: 'Отмена', de: 'Abbrechen', it: 'Annulla', hi: 'रद्द करें', ur: 'منسوخ کریں', ja: 'キャンセル', zh: '取消' },
  addCustomer: { en: '➕ Add new customer', ar: '➕ إضافة عميل جديد', ru: '➕ Добавить нового клиента', de: '➕ Neuen Kunden hinzufügen', it: '➕ Aggiungi nuovo cliente', hi: '➕ नया ग्राहक जोड़ें', ur: '➕ نیا صارف شامل کریں', ja: '➕ 新しい顧客を追加', zh: '➕ 添加新客户' },
};

export function useCustomersManagerDict() {
  return usePageDict(DICT);
}