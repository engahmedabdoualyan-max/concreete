/**
 * ============================================================
 *  POST /api/public/portal/[token]/request
 *  — customer self-service: ask for a delivery, an amendment or a cancellation
 * ============================================================
 *  NO AUTHENTICATION: the magic token is the credential, exactly like the
 *  read-only portal view.
 *
 *  DESIGN RULE (the important one)
 *  ───────────────────────────────
 *  A customer request NEVER mutates an order. It writes a row in
 *  `portal_requests` with status PENDING, which plant staff approve or reject.
 *  Reason: an order carries a credit check, a finance gate and a volume the
 *  plant is committed to deliver. If a public link could move any of that, one
 *  leaked token would be enough to change what the plant owes.
 *
 *  This is also what competitors call "self-service" — and the difference
 *  between a portal and a mailbox is that staff see the request in a queue.
 *
 *  BODY
 *    type: "NEW_ORDER" | "AMENDMENT" | "CANCELLATION"
 *    volumeM3, date, siteId?, mixDesignId?, note?   (NEW_ORDER)
 *    orderId, note?                                (AMENDMENT/CANCELLATION)
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  shareTokens,
  portalRequests,
  clients,
  deliverySites,
  mixDesigns,
  orders,
} from "@/db/schema";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const RequestSchema = z
  .object({
    type: z.enum(["NEW_ORDER", "AMENDMENT", "CANCELLATION"]),
    volumeM3: z.coerce.number().positive().max(5000).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .optional(),
    siteId: z.string().uuid().optional(),
    mixDesignId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    note: z.string().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "NEW_ORDER") {
      if (!value.volumeM3) {
        ctx.addIssue({ code: "custom", message: "الحجم مطلوب", path: ["volumeM3"] });
      }
      if (!value.date) {
        ctx.addIssue({ code: "custom", message: "التاريخ مطلوب", path: ["date"] });
      }
      if (!value.siteId) {
        ctx.addIssue({ code: "custom", message: "موقع التسليم مطلوب", path: ["siteId"] });
      }
      if (!value.mixDesignId) {
        ctx.addIssue({ code: "custom", message: "نوع الخرسانة مطلوب", path: ["mixDesignId"] });
      }
    } else if (!value.orderId) {
      ctx.addIssue({ code: "custom", message: "رقم الطلب مطلوب", path: ["orderId"] });
    }
  });

const notFound = () =>
  NextResponse.json(
    {
      success: false,
      errorCode: "PORTAL_NOT_FOUND",
      message: "This tracking link is invalid or has expired. Please ask your supplier for a new link.",
      timestamp: new Date().toISOString(),
    },
    { status: 404 }
  );

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 10 || token.length > 64) return notFound();

  const ip = clientIpFromHeaders(req.headers);
  const rate = checkNextRateLimit(`portal-request:${ip}`, 10);
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, errorCode: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const raw = await req.text();
  if (raw.length > 4000) {
    return NextResponse.json(
      { success: false, errorCode: "PAYLOAD_TOO_LARGE" },
      { status: 413 }
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { success: false, errorCode: "INVALID_JSON" },
      { status: 400 }
    );
  }
  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorCode: "VALIDATION_ERROR", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // ── the token must be a CLIENT-scope link ────────────────────────────────
  const shares = await db
    .select()
    .from(shareTokens)
    .where(
      and(
        eq(shareTokens.token, token),
        eq(shareTokens.isRevoked, false)
      )
    )
    .limit(1);
  const share = shares[0];
  if (!share) return notFound();
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) return notFound();
  if (share.scope !== "CLIENT" || !share.clientId) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "PORTAL_SCOPE",
        message:
          "This link only tracks a single delivery. Ask your supplier for a customer link to place requests.",
      },
      { status: 403 }
    );
  }

  // Never act for a blacklisted client: an order from them is a credit decision.
  const clientRows = await db
    .select({
      id: clients.id,
      isBlacklisted: clients.isBlacklisted,
      isActive: clients.isActive,
    })
    .from(clients)
    .where(
      and(eq(clients.id, share.clientId), eq(clients.tenantId, share.tenantId))
    )
    .limit(1);
  const client = clientRows[0];
  if (!client) return notFound();
  if (client.isBlacklisted) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "CLIENT_BLACKLISTED",
        message: "Please contact your supplier directly.",
      },
      { status: 403 }
    );
  }

  // ── validate the references belong to this client / tenant ───────────────
  if (body.type === "NEW_ORDER") {
    const siteRows = await db
      .select({ id: deliverySites.id })
      .from(deliverySites)
      .where(
        and(
          eq(deliverySites.id, body.siteId!),
          eq(deliverySites.clientId, share.clientId),
          eq(deliverySites.tenantId, share.tenantId),
          eq(deliverySites.isActive, true)
        )
      )
      .limit(1);
    if (!siteRows[0]) {
      return NextResponse.json(
        { success: false, errorCode: "UNKNOWN_SITE" },
        { status: 400 }
      );
    }
    const mixRows = await db
      .select({ id: mixDesigns.id })
      .from(mixDesigns)
      .where(
        and(
          eq(mixDesigns.id, body.mixDesignId!),
          eq(mixDesigns.tenantId, share.tenantId),
          eq(mixDesigns.isActive, true)
        )
      )
      .limit(1);
    if (!mixRows[0]) {
      return NextResponse.json(
        { success: false, errorCode: "UNKNOWN_MIX" },
        { status: 400 }
      );
    }
  } else {
    // The order must belong to the same client, otherwise one token could
    // touch any order in the system.
    const orderRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.id, body.orderId!),
          eq(orders.tenantId, share.tenantId),
          eq(orders.clientId, share.clientId)
        )
      )
      .limit(1);
    if (!orderRows[0]) {
      return NextResponse.json(
        { success: false, errorCode: "UNKNOWN_ORDER" },
        { status: 404 }
      );
    }
  }

  // ── one open request of the same kind per order, to stop tap-spam ────────
  if (body.type !== "NEW_ORDER") {
    const open = await db
      .select({ id: portalRequests.id })
      .from(portalRequests)
      .where(
        and(
          eq(portalRequests.tenantId, share.tenantId),
          eq(portalRequests.orderId, body.orderId!),
          eq(portalRequests.requestType, body.type),
          isNull(portalRequests.handledAt)
        )
      )
      .limit(1);
    if (open[0]) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "REQUEST_ALREADY_OPEN",
          message: "You already have a request in progress for this order.",
        },
        { status: 409 }
      );
    }
  }

  const inserted = await db
    .insert(portalRequests)
    .values({
      tenantId: share.tenantId,
      clientId: share.clientId,
      shareTokenId: share.id,
      requestType: body.type,
      status: "PENDING",
      orderId: body.type === "NEW_ORDER" ? null : body.orderId!,
      requestedVolumeM3:
        body.type === "NEW_ORDER"
          ? String(body.volumeM3)
          : body.volumeM3 != null
            ? String(body.volumeM3)
            : null,
      requestedDate: body.date ? new Date(`${body.date}T00:00:00.000Z`) : null,
      deliverySiteId: body.siteId ?? null,
      mixDesignId: body.mixDesignId ?? null,
      note: body.note ?? null,
    })
    .returning({ id: portalRequests.id, createdAt: portalRequests.createdAt });

  return NextResponse.json({
    success: true,
    data: {
      requestId: inserted[0].id,
      status: "PENDING",
      createdAt: inserted[0].createdAt,
      message:
        body.type === "NEW_ORDER"
          ? "تم استلام طلبك — مندوب المبيعات هيتواصل معاك للموافقة."
          : "تم استلام طلبك — فريق المبيعات هيتواصل معاك.",
    },
  });
}
