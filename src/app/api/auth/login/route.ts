/**
 * POST /api/auth/login
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticates a user with email + password.
 * Returns a JWT access token + refresh token pair.
 * Creates a user_sessions row for revocation tracking.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, userSessions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { issueTokenPair } from "@/lib/auth/jwt";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { z } from "zod";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/auth/phone";

export const dynamic = "force-dynamic";

const LoginSchema = z
  .object({
    /** Identifier: phone, email, or username. At least one is required. */
    phone: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
    /** Backward-compatible alias for `phone` (mobile app). */
    identifier: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    /** Device metadata for session tracking */
    deviceInfo: z
      .object({
        platform: z.string().default("unknown"),
        appVersion: z.string().default("1.0.0"),
        deviceId: z.string().default("unknown"),
      })
      .optional(),
  })
  .refine(
    (d) => Boolean(d.phone || d.email || d.username || d.identifier),
    { message: "Phone, email, or username is required", path: ["identifier"] }
  );

export async function POST(req: NextRequest) {
  // Rate limit auth handshakes: 20 attempts / minute / IP
  const rlIp = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`login:${rlIp}`, 20);
  if (!rl.allowed) {
    return errorResponse(
      "AUTH_RATE_LIMITED",
      `Too many login attempts. Retry in ${rl.retryAfterSeconds}s.`,
      429
    );
  }

  // 1. Parse and validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid login credentials format", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { phone, email, username, identifier, password, deviceInfo } = parsed.data;

  const rawIdentifier = phone ?? email ?? username ?? identifier ?? "";

  // 2. Fetch user by normalized phone, email, or username
  let userRows: any[] = [];
  if (rawIdentifier.includes("@")) {
    // Case-insensitive on BOTH sides. Folding only the input looks right and is
    // not: stored addresses are a mix of cases (`workshopMgr@`, `labTech@`, and
    // every migrated `ADMIN.driver1@` row), and `email = lower(input)` then
    // matches none of them, so those accounts could never log in at all. Folding
    // the column too is what "email is case-insensitive" actually means, and it
    // matches how tree-sync.service.ts already resolves the same column.
    userRows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${rawIdentifier.trim()})`)
      .limit(1);
  } else if (/^\+?[\d\s()-]{6,}$/.test(rawIdentifier)) {
    const normalizedPhone = normalizePhone(rawIdentifier);
    userRows = await db
      .select()
      .from(users)
      .where(eq(users.phoneNumber, normalizedPhone))
      .limit(1);
  } else {
    const lowered = rawIdentifier.trim().toLowerCase();
    const byCode = await db
      .select()
      .from(users)
      .where(eq(users.employeeCode, rawIdentifier.trim()))
      .limit(1);
    if (byCode.length) {
      userRows = byCode;
    } else {
      const byName = await db
        .select()
        .from(users)
        .where(eq(users.fullName, rawIdentifier.trim()))
        .limit(1);
      if (byName.length) userRows = byName;
    }
  }

  if (!userRows.length) {
    return errorResponse("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  // Constant-time comparison to prevent user enumeration
  const dummyHash = "$2b$10$invalid.hash.for.timing.safety.do.not.use";
  const userFound = userRows.length > 0;
  const hashToCheck = userFound ? userRows[0].passwordHash : dummyHash;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (!userFound || !passwordMatch) {
    return errorResponse(
      "INVALID_CREDENTIALS",
      "Invalid email or password",
      401
    );
  }

  const user = userRows[0];

  // 3. Check account is active
  if (!user.isActive) {
    return errorResponse(
      "ACCOUNT_DISABLED",
      "Your account has been deactivated. Please contact your administrator.",
      403
    );
  }

  // 4. Issue token pair
  const tokenPair = issueTokenPair({
    sub: user.id,
    tenantId: user.tenantId,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    role: user.role,
    permissions: (user.permissions as string[]) ?? [],
    zone: user.zone ?? undefined,
  });

  // 5. Persist session in DB for revocation support
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  await db.insert(userSessions).values({
    userId: user.id,
    tenantId: user.tenantId,
    jti: tokenPair.jti,
    deviceInfo: {
      platform: deviceInfo?.platform ?? "unknown",
      appVersion: deviceInfo?.appVersion ?? "1.0.0",
      deviceId: deviceInfo?.deviceId ?? "unknown",
      ip,
    },
    isRevoked: false,
    expiresAt: tokenPair.refreshExpiresAt,
  });

  // 6. Update last login timestamp
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return successResponse(
    {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresAt: tokenPair.accessExpiresAt.toISOString(),
      user: {
        id: user.id,
        tenantId: user.tenantId,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        zone: user.zone,
      },
    },
    "Login successful"
  );
}
