import { usePageDict, type PageDict } from './pageDict';

const DICT: PageDict = {
  notifTitle: { en: 'Notifications', ar: 'الإشعارات', ru: 'Уведомления', de: 'Benachrichtigungen', it: 'Notifiche', hi: 'सूचनाएँ', ur: 'اطلاعات', ja: '通知', zh: '通知' },
  notifHeader: { en: '🔔 System notifications', ar: '🔔 إشعارات النظام', ru: '🔔 Системные уведомления', de: '🔔 Systembenachrichtigungen', it: '🔔 Notifiche di sistema', hi: '🔔 सिस्टम सूचनाएँ', ur: '🔔 سسٹم کی اطلاعات', ja: '🔔 システム通知', zh: '🔔 系统通知' },
  notifEmpty: { en: 'No notifications yet.', ar: 'لا توجد إشعارات بعد.', ru: 'Уведомлений пока нет.', de: 'Noch keine Benachrichtigungen.', it: 'Nessuna notifica ancora.', hi: 'अभी कोई सूचना नहीं।', ur: 'ابھی کوئی اطلاعات نہیں۔', ja: '通知はまだありません。', zh: '暂无通知。' },
};

export function useNotificationsBellDict() {
  return usePageDict(DICT);
}