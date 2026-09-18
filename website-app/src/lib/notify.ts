let permAsked = false;

/**
 * Fire a system/desktop notification (Notification API). Asks for permission
 * once on first use, then silently renders system toasts for every app event
 * that also lands in the in-app bell (see addNotification in firestore.ts).
 * Safe no-op when the browser has no Notification support.
 */
export function notifyBrowser(title: string, body?: string): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  try {
    if (Notification.permission === 'granted') {
      const n = new Notification(title, { body: body || '', icon: undefined, tag: undefined });
      n.onclick = () => {
        try {
          window.focus();
          n.close();
        } catch {}
      };
    } else if (Notification.permission === 'default' && !permAsked) {
      permAsked = true;
      Notification.requestPermission()
        .then(p => { if (p === 'granted') notifyBrowser(title, body); })
        .catch(() => {});
    }
  } catch {}
}