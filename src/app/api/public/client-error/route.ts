/**
 * ============================================================
 *  POST /api/public/client-error — client error intake
 * ============================================================
 *  The mobile/desktop app ships without a crash reporter, so a failure that
 *  happens on a customer's phone is invisible to us: the user says "the app
 *  does nothing" and we cannot see why. This endpoint lets the app hand the
 *  failure over, and we write it to the server log where Render keeps it.
 *
 *  NO AUTHENTICATION by design — the client cannot sign anything when it is
 *  crashing — so the body is validated hard, the size is capped, and the rate
 *  limit is strict. It accepts no free-form user data on purpose.
 * ============================================================
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_MESSAGE = 500;
const MAX_STACK = 4000;

const ClientErrorSchema = z.object({
  /** where it happened, e.g. "orders/list" — a small allow-list of characters */
  screen: z
    .string()
    .max(80)
    .regex(/^[A-Za-z0-9_\-/. ]*$/)
    .optional(),
  message: z.string().min(1).max(MAX_MESSAGE),
  stack: z.string().max(MAX_STACK).optional(),
  /** app version string, so we can tell which build is affected */
  appVersion: z.string().max(40).optional(),
  platform: z.enum(["ios", "android", "web", "windows", "linux", "macos"]).optional(),
  locale: z.string().max(10).optional(),
  /** free-form breadcrumbs, capped so a loop cannot flood the log */
  context: z.array(z.string().max(120)).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const rl = checkNextRateLimit(`client-error:${clientIpFromHeaders(req.headers)}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, errorCode: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // Reject oversized bodies before parsing them.
  const raw = await req.text();
  if (raw.length > 12_000) {
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

  const parsed = ClientErrorSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorCode: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const e = parsed.data;
  // Structured, greppable, one line per report.
  console.error(
    "[client-error]",
    JSON.stringify({
      at: new Date().toISOString(),
      screen: e.screen ?? null,
      message: e.message,
      platform: e.platform ?? null,
      appVersion: e.appVersion ?? null,
      locale: e.locale ?? null,
      context: e.context ?? [],
      stack: e.stack ?? null,
    })
  );

  return NextResponse.json({ success: true, data: { received: true } });
}
