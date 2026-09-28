"use client";

/**
 * Customer request form (portal page).
 *
 * Deliberately plain: a customer on a phone in a site, possibly on a weak
 * connection, must be able to ask for concrete in four taps. The form posts to
 * the public portal endpoint, which records a *request* — the plant approves it,
 * it never mutates an order by itself.
 */

import { useState } from "react";

type Site = { id: string; siteName: string; city: string | null };
type Mix = {
  id: string;
  designCode: string;
  gradeDescription: string | null;
  targetSlumpCm: number | null;
};

const field =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-800 focus:border-amber-500 focus:outline-none";
const label = "block text-sm font-semibold text-slate-600 mb-1";

export function PortalRequestForm({
  token,
  sites,
  mixes,
  onDone,
}: {
  token: string;
  sites: Site[];
  mixes: Mix[];
  onDone?: () => void;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [mixDesignId, setMixDesignId] = useState(mixes[0]?.id ?? "");
  const [volume, setVolume] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (type: "NEW_ORDER" | "CANCELLATION" | "AMENDMENT", orderId?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/public/portal/${token}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          ...(orderId ? { orderId } : {}),
          ...(type === "NEW_ORDER"
            ? {
                siteId,
                mixDesignId,
                volumeM3: Number(volume),
                date,
                note: note || undefined,
              }
            : { note: note || undefined }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({
          ok: true,
          text:
            body?.data?.message ??
            "تم استلام طلبك — فريق المبيعات هيتواصل معاك.",
        });
        setVolume("");
        setNote("");
        onDone?.();
      } else {
        setMessage({
          ok: false,
          text:
            body?.message ??
            (res.status === 409
              ? "في طلب مفتوح لنفس العملية — استنى ردّنا الأول."
              : "مش قادرين نسلّم الطلب دلوقتي، جرّب تاني أو كلّمنا."),
        });
      }
    } catch {
      setMessage({ ok: false, text: "شبكة ضعيفة — اتأكد من الإنترنت وجرّب تاني." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm p-4">
      <h2 className="text-lg font-bold text-slate-800 mb-1">اطلب خرسانة</h2>
      <p className="text-xs text-slate-500 mb-4">
        الطلب يروح لفريق المبيعات للموافقة، وبعدها يتأكد معاك بموعد الصب.
      </p>

      <div className="space-y-3">
        <div>
          <label className={label} htmlFor="portal-site">
            موقع التسليم
          </label>
          <select
            id="portal-site"
            className={field}
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
          >
            {sites.length === 0 ? (
              <option value="">لا توجد مواقع مسجّلة — كلّم مندوبك</option>
            ) : null}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.siteName}
                {s.city ? ` — ${s.city}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="portal-mix">
            نوع الخرسانة
          </label>
          <select
            id="portal-mix"
            className={field}
            value={mixDesignId}
            onChange={(e) => setMixDesignId(e.target.value)}
          >
            {mixes.length === 0 ? (
              <option value="">لا توجد خلطات معرّفة</option>
            ) : null}
            {mixes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.designCode}
                {m.gradeDescription ? ` — ${m.gradeDescription}` : ""}
                {m.targetSlumpCm ? ` (هبوط ${m.targetSlumpCm}سم)` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="portal-volume">
              الكمية (م³)
            </label>
            <input
              id="portal-volume"
              className={field}
              type="number"
              inputMode="decimal"
              min="1"
              step="0.5"
              placeholder="20"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            />
          </div>
          <div>
            <label className={label} htmlFor="portal-date">
              تاريخ الصب
            </label>
            <input
              id="portal-date"
              className={field}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={label} htmlFor="portal-note">
            ملاحظات (اختياري)
          </label>
          <textarea
            id="portal-note"
            className={field}
            rows={2}
            placeholder="مثال: الصب بدري، محتاج خلطة آمنة للحرارة…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button
          type="button"
          disabled={busy || !siteId || !mixDesignId || !volume || !date}
          onClick={() => submit("NEW_ORDER")}
          className="w-full rounded-xl bg-amber-500 py-4 text-base font-bold text-white disabled:opacity-40"
        >
          {busy ? "جارِ الإرسال…" : "إرسال الطلب"}
        </button>

        {message ? (
          <p
            className={`rounded-xl px-3 py-3 text-sm ${
              message.ok
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function PortalCancelButton({
  token,
  orderNumber,
}: {
  token: string;
  orderNumber: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  const ask = async () => {
    if (!window.confirm(`طلب إلغاء ${orderNumber}؟\nهيتبعت لفريق المبيعات للموافقة.`))
      return;
    setState("busy");
    try {
      const orders = await fetch(`/api/public/portal/${token}`, { cache: "no-store" });
      const body = await orders.json();
      const order = (body?.data?.statements ?? []).find(
        (o: { orderNumber: string }) => o.orderNumber === orderNumber
      );
      if (!order?.id) {
        setState("idle");
        return;
      }
      const res = await fetch(`/api/public/portal/${token}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CANCELLATION", orderId: order.id }),
      });
      setState(res.ok ? "done" : "idle");
    } catch {
      setState("idle");
    }
  };

  if (state === "done") {
    return <span className="text-xs font-semibold text-emerald-700">تم إرسال طلب الإلغاء</span>;
  }
  return (
    <button
      type="button"
      onClick={ask}
      disabled={state === "busy"}
      className="text-xs font-semibold text-red-600 underline disabled:opacity-50"
    >
      {state === "busy" ? "جارِ الإرسال…" : "طلب إلغاء"}
    </button>
  );
}
