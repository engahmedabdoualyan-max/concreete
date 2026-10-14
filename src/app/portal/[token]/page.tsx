import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePortalToken } from "@/lib/services/portal.service";
import { PortalRequestForm, PortalCancelButton } from "../portal-client";

/**
 * The customer portal — a web page, not an app.
 * =========================================
 * A customer will not install an application to order concrete. They open a
 * link that the plant sent them (usually on WhatsApp) and this page answers
 * everything: what is being poured, what is left, what it cost so far, and two
 * buttons — request a delivery, request a cancellation.
 *
 * Security model, inherited from the API and not negotiable:
 *   • the magic token IS the credential, so every response is public-safe
 *   • the page can only *request*; plant staff approve every change
 *   • an ORDER-scope link (single delivery tracking) cannot request anything
 *   • a blacklisted client gets the same "contact your supplier" answer
 *
 * Mobile-first and RTL, because it is opened on a phone at a construction
 * site, often on a weak connection: no framework, no images, ~8 KB of HTML.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "بوابة العميل — تتبّع الطلبات",
  robots: { index: false, follow: false },
};

const STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_FINANCE: "بانتظار الموافقة المالية",
  CREDIT_HOLD: "موقوف ائتمانيًا",
  FINANCE_REJECTED: "مرفوض",
  APPROVED: "معتمد",
  APPROVED_SCHEDULED: "معتمد ومجدول",
  SCHEDULED: "مجدول",
  IN_PRODUCTION: "في الإنتاج",
  IN_TRANSIT: "في الطريق",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
  ON_HOLD: "موقوف",
};

const money = (v: number) =>
  `${Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ر.س`;

const card = "bg-white rounded-2xl shadow-sm p-4";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const portal = await resolvePortalToken(token).catch(() => null);
  if (!portal) notFound();

  if (portal.scope === "ORDER") {
    const { order: o } = portal as Extract<typeof portal, { scope: "ORDER" }>;
    return (
      <main dir="rtl" className="min-h-screen bg-slate-100 p-4 font-sans">
        <div className="mx-auto max-w-lg space-y-4">
          <Header subtitle="تتبّع طلب واحد" />
          <section className={card}>
            <h1 className="text-xl font-bold text-slate-800">{o.orderNumber}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {o.clientName} · {o.siteName}
              {o.city ? ` — ${o.city}` : ""}
            </p>
            <div className="mt-4">
              <Progress
                delivered={Number(o.deliveredM3)}
                total={Number(o.totalM3)}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Row label="الحالة" value={STATUS_AR[o.status] ?? o.status} />
              <Row label="الخلطة" value={o.mix} />
              <Row label="الإجمالي" value={`${o.totalM3} م³`} />
              <Row label="المسلّم" value={`${o.deliveredM3} م³`} />
            </dl>
          </section>
          <Trips trips={portal.trips} />
          <p className="text-center text-xs text-slate-400 pb-6">
            أي استفسار: كلّم مندوب المبيعات المسؤول عن طلبك.
          </p>
        </div>
      </main>
    );
  }

  const c = portal as Extract<typeof portal, { scope: "CLIENT" }>;
  const sites = c.sites ?? [];
  const mixes = c.mixDesigns ?? [];

  return (
    <main dir="rtl" className="min-h-screen bg-slate-100 p-4 font-sans">
      <div className="mx-auto max-w-lg space-y-4">
        <Header subtitle={c.client.companyName} />

        {/* money summary */}
        <section className={card}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="الطلبات" value={String(c.summary.ordersCount)} />
            <Stat label="إجمالي الفواتير" value={money(c.summary.totalBilledSar)} />
            <Stat
              label="الحد الائتماني"
              value={money(c.client.creditLimitSar)}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500 text-center">
            المستحق الحالي: {money(c.client.outstandingSar)}
          </p>
        </section>

        {/* new order */}
        {sites.length > 0 && mixes.length > 0 ? (
          <PortalRequestForm token={token} sites={sites} mixes={mixes} />
        ) : (
          <section className={`${card} border border-amber-200`}>
            <p className="text-sm text-amber-800">
              لازم نتأكد من مواقع التسليم والخلطات مع مندوبك قبل ما تقدر تطلب أونلاين.
            </p>
          </section>
        )}

        {/* orders */}
        <h2 className="text-lg font-bold text-slate-800 pt-2">طلباتي</h2>
        {c.statements.length === 0 ? (
          <section className={`${card} text-center text-slate-500 text-sm`}>
            مفيش طلبات لسه.
          </section>
        ) : null}
        {c.statements.map((o) => (
          <section key={o.orderId} className={card}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800">{o.orderNumber}</p>
                <p className="text-xs text-slate-500">
                  {o.mix}
                  {o.gradeDescription ? ` — ${o.gradeDescription}` : ""}
                </p>
              </div>
              <span className="text-xs font-semibold bg-slate-100 text-slate-600 rounded-full px-3 py-1">
                {STATUS_AR[o.status] ?? o.status}
              </span>
            </div>
            <div className="mt-3">
              <Progress delivered={o.deliveredM3} total={o.totalM3} />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-600">
                {Number(o.remainingM3)} م³ متبقّي
              </span>
              {o.status !== "DELIVERED" && o.status !== "CANCELLED" ? (
                <PortalCancelButton token={token} orderNumber={o.orderNumber} />
              ) : null}
            </div>
          </section>
        ))}

        <p className="text-center text-xs text-slate-400 pb-6">
          كل الطلبات والتعديلات تمر على موافقة فريق المبيعات قبل التنفيذ.
        </p>
      </div>
    </main>
  );
}

// ─── small presentational pieces ─────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header className="text-center pt-2">
      <p className="text-xs text-slate-500">بوابة العميل</p>
      <h1 className="text-xl font-extrabold text-slate-900">{subtitle}</h1>
    </header>
  );
}

function Progress({ delivered, total }: { delivered: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((delivered / total) * 100)) : 0;
  return (
    <div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-xs text-slate-500 mt-1">
        تم تسليم {delivered} من {total} م³ ({pct}%)
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800 mt-0.5">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Trips({
  trips,
}: {
  trips: {
    tripNumber: string;
    loadedVolumeM3: unknown;
    currentCheckpoint: string;
    isCompleted: boolean;
    signedAt: Date | null;
  }[];
}) {
  if (!trips?.length) return null;
  const CHECK_AR: Record<string, string> = {
    ARR_PLANT: "وصل المصنع",
    ARR_BSTC: "تحت الخلاط",
    DEP_PLANT: "خرج من المصنع",
    ARR_SITE: "وصل الموقع",
    POUR_START: "بدأ الصب",
    DEP_SITE: "خرج من الموقع",
    RETURN_PLANT: "رجع للمصنع",
  };
  return (
    <section className={card}>
      <h2 className="text-sm font-bold text-slate-700 mb-2">شاحناتك</h2>
      <ul className="space-y-2">
        {trips.map((t) => (
          <li
            key={t.tripNumber}
            className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
          >
            <span className="font-semibold text-slate-700">{t.tripNumber}</span>
            <span className="text-slate-500">
              {t.isCompleted ? "✅ تم التسليم" : CHECK_AR[t.currentCheckpoint] ?? t.currentCheckpoint}{" "}
              · {String(t.loadedVolumeM3)} م³
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
