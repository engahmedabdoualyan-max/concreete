import emailjs from '@emailjs/browser';

const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'UPIUNYeckrEK-z_xz';
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_mdtxmv8';
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_ablqhm3';

// Initialize EmailJS
emailjs.init(EMAILJS_PUBLIC_KEY);

const STATUS_LABELS: Record<string, { ar: string; icon: string }> = {
  pending:     { ar: 'بانتظار الموافقة', icon: '⏳' },
  approved:    { ar: 'تمت الموافقة',    icon: '✅' },
  scheduled:   { ar: 'تم الجدولة',      icon: '📅' },
  in_progress: { ar: 'قيد التنفيذ',     icon: '🚚' },
  completed:   { ar: 'تم التسليم',      icon: '🎉' },
  cancelled:   { ar: 'ملغي',            icon: '❌' },
};

/**
 * Send WhatsApp notification to customer (opens WhatsApp with pre-filled message).
 * Free - no API required, uses wa.me URL scheme.
 */
export function sendWhatsAppNotification(order: {
  customerName: string;
  customerPhone: string;
  orderNo?: string;
  projectName: string;
  quantity: number;
  concreteType: string;
  status: string;
}): void {
  const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
  const phone = order.customerPhone.replace(/[^0-9]/g, '');
  
  const message = encodeURIComponent(
    `مرحباً ${order.customerName} 👋\n\n` +
    `تحديث حالة طلبك #${order.orderNo || '—'}:\n\n` +
    `📦 المشروع: ${order.projectName}\n` +
    `🏗️ الكمية: ${order.quantity} م³\n` +
    `🧱 نوع الخرسانة: ${order.concreteType}\n` +
    `📊 الحالة: ${st.icon} ${st.ar}\n\n` +
    `للمتابعة: https://concrete.fimtosoft.com/#/portal\n\n` +
    `مع خالص التحيات,\nفريق Fimto Soft`
  );
  
  // Open WhatsApp with pre-filled message
  const url = `https://wa.me/${phone}?text=${message}`;
  window.open(url, '_blank');
}

/**
 * Send email notification to customer when order status changes.
 * In demo mode, this just logs to console. In production, configure EmailJS templates.
 */
export async function sendOrderStatusEmail(order: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  orderNo?: string;
  projectName: string;
  quantity: number;
  concreteType: string;
  status: string;
}): Promise<boolean> {
  const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;

  // If no email configured, just log
  if (!order.customerEmail) {
    console.log(`[Email Notification] Order ${order.orderNo} → ${st.ar} for ${order.customerName}`);
    return false;
  }

  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_name: order.customerName,
      to_email: order.customerEmail,
      subject: `${st.icon} تحديث حالة طلبك #${order.orderNo || '—'}`,
      message: `مرحباً ${order.customerName},

تم تحديث حالة طلبك رقم #${order.orderNo || '—'}:

📦 المشروع: ${order.projectName}
🏗️ الكمية: ${order.quantity} م³
🧱 نوع الخرسانة: ${order.concreteType}
📊 الحالة الجديدة: ${st.ar}

للمتابعة: https://concrete.fimtosoft.com/#/portal

مع خالص التحيات,
فريق Fimto Soft`,
    });
    console.log(`[Email Notification] Sent to ${order.customerEmail}`);
    return true;
  } catch (err) {
    console.warn('[Email Notification] Failed:', err);
    return false;
  }
}
