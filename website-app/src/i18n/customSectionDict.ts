import { usePageDict, type PageDict } from './pageDict';

export function useCustomSectionDict() {
  return usePageDict(DICT);
}

const DICT: PageDict = {
  customSection: { en: 'Custom Section', ar: 'قسم مخصص', ru: 'Пользовательский раздел', de: 'Eigener Bereich', it: 'Sezione personalizzata', hi: 'कस्टम सेक्शन', ur: 'کسٹم سیکشن', ja: 'カスタムセクション', zh: '自定义板块' },
  customDesc1: { en: 'This section is custom and can be added by the manager from the admin panel.', ar: 'هذا القسم مخصص ويمكن للمدير إضافته من خلال لوحة الإدارة.', ru: 'Этот раздел является пользовательским, и менеджер может добавить его через панель администратора.', de: 'Dieser Bereich ist individuell und kann vom Manager über das Admin-Panel hinzugefügt werden.', it: 'Questa sezione è personalizzata e può essere aggiunta dal manager tramite il pannello di amministrazione.', hi: 'यह सेक्शन कस्टम है और प्रबंधक इसे व्यवस्थापक पैनल से जोड़ सकता है।', ur: 'یہ سیکشن کسٹم ہے اور مینیجر اسے ایڈمن پینل سے شامل کر سکتا ہے۔', ja: 'このセクションはカスタムで、管理者パネルから管理者が追加できます。', zh: '此板块为自定义板块，管理员可通过管理面板添加。' },
  customDesc2: { en: 'It can be linked to any custom content or application.', ar: 'يمكن ربطه بأي محتوى أو تطبيق مخصص.', ru: 'Его можно привязать к любому пользовательскому содержимому или приложению.', de: 'Er kann mit beliebigen eigenen Inhalten oder Anwendungen verknüpft werden.', it: 'Può essere collegato a qualsiasi contenuto o applicazione personalizzata.', hi: 'इसे किसी भी कस्टम सामग्री या एप्लिकेशन से जोड़ा जा सकता है।', ur: 'اسے کسی بھی کسٹم مواد یا ایپلیکیشن سے منسلک کیا جا سکتا ہے۔', ja: '任意のカスタムコンテンツやアプリケーションにリンクできます。', zh: '可关联到任何自定义内容或应用。' },
  backToMain: { en: '← Back to main dashboard', ar: '← العودة للوحة الرئيسية', ru: '← Вернуться на главную панель', de: '← Zurück zur Hauptübersicht', it: '← Torna alla dashboard principale', hi: '← मुख्य डैशबोर्ड पर वापस जाएं', ur: '← مرکزی ڈیش بورڈ پر واپس جائیں', ja: '← メインダッシュボードに戻る', zh: '← 返回主面板' },
};