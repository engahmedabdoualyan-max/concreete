/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Customer Notification Service (Epic 1 — Competitive Parity)
 * ============================================================
 *
 *  Automatic customer updates on trip events (InfoRMC / BatchLogic parity):
 *    DEP_PLANT → "🚚 Your mixer is on the way + ETA"
 *    ARR_SITE  → "📍 Your mixer arrived at site"
 *    DEP_SITE  → "✅ Pour finished, mixer returning"
 *
 *  PROVIDERS (selected via NOTIFY_PROVIDER env):
 *    • log       — dev default: console + audit_logs only (no SMS cost)
 *    • msegat    — Saudi SMS gateway (Msegat.com)
 *    • unifonic  — MENA SMS gateway (Unifonic Apps API)
 *    • twilio    — global SMS fallback
 *    • whatsapp  — WhatsApp Cloud API (template message)
 *
 *  SAFETY: every send is fire-and-forget — notification failures
 *  NEVER break dispatch. All attempts are written to audit_logs.
 * ============================================================
 */

import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export type NotifyEvent = "TRUCK_DEPARTED" | "TRUCK_ARRIVED" | "POUR_FINISHED";
export type NotifyChannel = "sms" | "whatsapp";
export type NotifyProvider = "log" | "msegat" | "unifonic" | "twilio" | "whatsapp";

export interface NotifyParams {
  tenantId: string;
  tripId: string;
  to: string; // raw client phone
  event: NotifyEvent;
  locale?: "ar" | "en";
  vars: {
    tripNumber: string;
    clientName?: string;
    siteName?: string;
    volumeM3?: string;
    ticketNumber?: string;
    etaMinutes?: number;
  };
}

// ─── Bilingual templates ──────────────────────────────────────────────────────

const TEMPLATES: Record<NotifyEvent, { ar: (v: NotifyParams["vars"]) => string; en: (v: NotifyParams["vars"]) => string }> = {
  TRUCK_DEPARTED: {
    ar: (v) =>
      `🚚 فيمتو للخرسانة: الخلاط في الطريق إليكم\n` +
      `الرحلة: ${v.tripNumber} • الكمية: ${v.volumeM3 ?? "—"} م³\n` +
      `الموقع: ${v.siteName ?? "—"}\n` +
      `${v.etaMinutes ? `الوصول المتوقع خلال ~${v.etaMinutes} دقيقة\n` : ""}` +
      `تذكرة: ${v.ticketNumber ?? "—"}`,
    en: (v) =>
      `🚚 Fimto Concrete: Your mixer is on the way\n` +
      `Trip: ${v.tripNumber} • Qty: ${v.volumeM3 ?? "—"} m³\n` +
      `Site: ${v.siteName ?? "—"}\n` +
      `${v.etaMinutes ? `ETA ~${v.etaMinutes} min\n` : ""}` +
      `Ticket: ${v.ticketNumber ?? "—"}`,
  },
  TRUCK_ARRIVED: {
    ar: (v) =>
      `📍 فيمتو للخرسانة: وصل الخلاط إلى الموقع\n` +
      `الرحلة: ${v.tripNumber} • الموقع: ${v.siteName ?? "—"}\n` +
      `يرجى تجهيز موقع الصب.`,
    en: (v) =>
      `📍 Fimto Concrete: Mixer arrived at site\n` +
      `Trip: ${v.tripNumber} • Site: ${v.siteName ?? "—"}\n` +
      `Please prepare the pour location.`,
  },
  POUR_FINISHED: {
    ar: (v) =>
      `✅ فيمتو للخرسانة: انتهى الصب — الرحلة ${v.tripNumber}\n` +
      `الكمية: ${v.volumeM3 ?? "—"} م³ • شكراً لثقتكم.`,
    en: (v) =>
      `✅ Fimto Concrete: Pour finished — Trip ${v.tripNumber}\n` +
      `Qty: ${v.volumeM3 ?? "—"} m³ • Thank you.`,
  },
};

/** Normalise Saudi/GCC mobile numbers to E.164-ish format. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("966") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("05") && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `+966${digits}`;
  return `+${digits}`;
}

function resolveProvider(): NotifyProvider {
  const raw = (process.env.NOTIFY_PROVIDER ?? "log").toLowerCase();
  if (["log", "msegat", "unifonic", "twilio", "whatsapp"].includes(raw)) {
    return raw as NotifyProvider;
  }
  return "log";
}

async function sendViaMsegat(to: string, message: string): Promise<void> {
  const userName = process.env.MSEGAT_USERNAME;
  const apiKey = process.env.MSEGAT_API_KEY;
  const sender = process.env.MSEGAT_SENDER ?? "FIMTO";
  if (!userName || !apiKey) throw new Error("MSEGAT credentials missing");
  const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName,
      numbers: to.replace("+", ""),
      userSender: sender,
      apiKey,
      msg: message,
    }),
  });
  if (!res.ok) throw new Error(`Msegat HTTP ${res.status}`);
}

async function sendViaUnifonic(to: string, message: string): Promise<void> {
  const appSid = process.env.UNIFONIC_APPSID;
  const sender = process.env.UNIFONIC_SENDER ?? "FIMTO";
  if (!appSid) throw new Error("UNIFONIC_APPSID missing");
  const body = new URLSearchParams({
    AppSid: appSid,
    Recipient: to.replace("+", ""),
    Body: message,
    SenderID: sender,
  });
  const res = await fetch("https://el.cloud.unifonic.com/rest/plivo/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Unifonic HTTP ${res.status}`);
}

async function sendViaTwilio(to: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error("Twilio credentials missing");
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );
  if (!res.ok) throw new Error(`Twilio HTTP ${res.status}`);
}

async function sendViaWhatsApp(to: string, message: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) throw new Error("WhatsApp credentials missing");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace("+", ""),
        type: "text",
        text: { body: message },
      }),
    }
  );
  if (!res.ok) throw new Error(`WhatsApp HTTP ${res.status}`);
}

/**
 * Sends a customer notification. NEVER throws — logs failures to audit_logs
 * and returns the outcome. Safe to call fire-and-forget from hot paths.
 */
export async function notifyCustomer(
  params: NotifyParams
): Promise<{ sent: boolean; channel: NotifyChannel; provider: NotifyProvider; error?: string }> {
  const provider = resolveProvider();
  const channel: NotifyChannel = provider === "whatsapp" ? "whatsapp" : "sms";
  const to = normalizePhone(params.to);
  const locale = params.locale ?? "ar";
  const message = TEMPLATES[params.event][locale](params.vars);

  const audit = async (sent: boolean, error?: string) => {
    try {
      await db.insert(auditLogs).values({
        tenantId: params.tenantId,
        userId: null,
        action: "CUSTOMER_NOTIFIED",
        entityType: "trip",
        entityId: params.tripId,
        newState: {
          event: params.event,
          channel,
          provider,
          to,
          sent,
          error: error ?? null,
        },
      });
    } catch {
      // Audit failure must never cascade
    }
  };

  if (!to) {
    await audit(false, "INVALID_PHONE");
    return { sent: false, channel, provider, error: "INVALID_PHONE" };
  }

  if (provider === "log") {
    console.log(`[notify:${params.event}] → ${to}\n${message}`);
    await audit(true);
    return { sent: true, channel, provider };
  }

  try {
    if (provider === "msegat") await sendViaMsegat(to, message);
    else if (provider === "unifonic") await sendViaUnifonic(to, message);
    else if (provider === "twilio") await sendViaTwilio(to, message);
    else await sendViaWhatsApp(to, message);
    await audit(true);
    return { sent: true, channel, provider };
  } catch (err) {
    const error = err instanceof Error ? err.message : "SEND_FAILED";
    console.error(`[notify:${params.event}] failed via ${provider}:`, error);
    await audit(false, error);
    return { sent: false, channel, provider, error };
  }
}
