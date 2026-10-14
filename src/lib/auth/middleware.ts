/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Next.js App Router Authentication & RBAC Middleware
 * ============================================================
 *
 *  Usage in API route handlers:
 *
 *  // Require any authenticated user:
 *  export async function GET(req: NextRequest) {
 *    const auth = await requireAuth(req);
 *    if (auth instanceof NextResponse) return auth;   // 401/403
 *    const { user } = auth;
 *    // ... handler logic
 *  }
 *
 *  // Require specific permission:
 *  const auth = await requirePermission(req, PERMISSIONS.ORDER_APPROVE_FINANCE);
 *  if (auth instanceof NextResponse) return auth;
 *
 *  // Require one of several roles:
 *  const auth = await requireRole(req, ["FINANCE", "SUPER_ADMIN"]);
 *  if (auth instanceof NextResponse) return auth;
 * ============================================================
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, withDbRetry } from "@/db";
import { userSessions, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  verifyAccessToken,
  extractBearerToken,
  AuthError,
  type TokenPayload,
} from "./jwt";
import {
  userHasPermission,
  userHasAnyPermission,
  type Permission,
} from "./rbac";
import type { UserRole } from "@/db/schema";
import { assertTenantId } from "@/lib/tenant";

// ─── Auth Context ─────────────────────────────────────────────────────────────

export interface AuthContext {
  user: TokenPayload;
}

// ─── Standard Error Responses ─────────────────────────────────────────────────

function unauthorizedResponse(code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      errorCode: code,
      message,
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="fimto-erp"',
      },
    }
  );
}

function forbiddenResponse(code: string, message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      errorCode: code,
      message,
    },
    { status: 403 }
  );
}

// ─── Core Auth Middleware ─────────────────────────────────────────────────────

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Also validates the session is not revoked in the database.
 *
 * Returns AuthContext on success, or NextResponse (401/403) on failure.
 */
export async function requireAuth(
  req: NextRequest
): Promise<AuthContext | NextResponse> {
  // 1. Extract token
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return unauthorizedResponse(
      "TOKEN_MISSING",
      "Authorization header with Bearer token is required"
    );
  }

  // 2. Verify JWT signature & expiry
  let payload: TokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof AuthError) {
      return unauthorizedResponse(err.code, err.message);
    }
    return unauthorizedResponse("TOKEN_INVALID", "Token verification failed");
  }

  // A valid signature alone is not enough: every ERP request must carry a
  // syntactically valid tenant boundary. Route handlers still must apply it to
  // each query/mutation; this guard prevents unscoped tokens from entering.
  try {
    assertTenantId(payload.tenantId);
  } catch {
    return unauthorizedResponse("TENANT_CONTEXT_REQUIRED", "A valid tenant context is required");
  }

  // 3. Check session revocation in database (prevents forced-logout bypass)
  //    Retried on a dropped connection, and reported as 503 (not 401) when the
  //    database is genuinely unreachable — a 401 here used to log a perfectly
  //    valid user out every time the free server woke up.
  let sessionRows: Array<{ isRevoked: boolean | null }>;
  try {
    sessionRows = await withDbRetry(
      () =>
        db
          .select({ isRevoked: userSessions.isRevoked })
          .from(userSessions)
          .where(
            and(
              eq(userSessions.jti, payload.jti),
              eq(userSessions.userId, payload.sub),
              eq(userSessions.tenantId, payload.tenantId),
            ),
          )
          .limit(1),
      "auth.session-check",
    );
  } catch {
    // If DB check fails, reject to be safe (fail-secure)
    return NextResponse.json(
      {
        success: false,
        errorCode: "SERVICE_UNAVAILABLE",
        message: "Database temporarily unavailable — please try again",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  if (sessionRows.length === 0) {
    return unauthorizedResponse("TOKEN_REVOKED", "Session not found — please log in again");
  }

  if (sessionRows[0].isRevoked) {
    return unauthorizedResponse("TOKEN_REVOKED", "Session has been revoked — please log in again");
  }

  // 4. Verify user account is still active
  let userRows: Array<{ isActive: boolean | null }>;
  try {
    userRows = await withDbRetry(
      () =>
        db
          .select({ isActive: users.isActive })
          .from(users)
          .where(and(eq(users.id, payload.sub), eq(users.tenantId, payload.tenantId)))
          .limit(1),
      "auth.account-check",
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: "SERVICE_UNAVAILABLE",
        message: "Database temporarily unavailable — please try again",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  if (userRows.length === 0 || !userRows[0].isActive) {
    return unauthorizedResponse(
      "ACCOUNT_DISABLED",
      "Your account has been deactivated. Contact your administrator."
    );
  }

  return { user: payload };
}

// ─── Permission Guard ─────────────────────────────────────────────────────────

/**
 * Extends requireAuth to also check for a specific permission.
 * Returns AuthContext on success, or NextResponse on failure.
 */
export async function requirePermission(
  req: NextRequest,
  permission: Permission
): Promise<AuthContext | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;

  if (!userHasPermission(user.role, user.permissions ?? [], permission)) {
    return forbiddenResponse(
      "INSUFFICIENT_PERMISSION",
      `This action requires the '${permission}' permission. Your role (${user.role}) does not have access.`
    );
  }

  return authResult;
}

// ─── Role Guard ───────────────────────────────────────────────────────────────

/**
 * Extends requireAuth to also check for one of the allowed roles.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: UserRole[]
): Promise<AuthContext | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;

  if (!allowedRoles.includes(user.role)) {
    return forbiddenResponse(
      "INSUFFICIENT_ROLE",
      `This endpoint is restricted to: ${allowedRoles.join(", ")}. Your role is: ${user.role}.`
    );
  }

  return authResult;
}

// ─── Multi-Permission Guard ───────────────────────────────────────────────────

/**
 * Requires the user to have ANY of the specified permissions (OR logic).
 */
export async function requireAnyPermission(
  req: NextRequest,
  permissions: Permission[]
): Promise<AuthContext | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const { user } = authResult;

  if (!userHasAnyPermission(user.role, user.permissions ?? [], permissions)) {
    return forbiddenResponse(
      "INSUFFICIENT_PERMISSION",
      `This action requires one of: ${permissions.join(", ")}.`
    );
  }

  return authResult;
}

// ─── Helpers for Response Building ───────────────────────────────────────────

/**
 * Standard success response shape for all ERP API endpoints
 */
export function successResponse<T>(
  data: T,
  message?: string,
  status = 200
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      message: message ?? "OK",
      data,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}

/**
 * Standard error response shape
 */
export function errorResponse(
  errorCode: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      errorCode,
      message,
      details,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
