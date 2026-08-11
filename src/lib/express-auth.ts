/**
 * ============================================================
 *  Express JWT Auth + 7-Role RBAC Guard
 * ============================================================
 *
 * Production use:
 *   router.get('/secure', requireAuth, requireRoles('PLANT_MGR'), handler)
 */

import type { Request, Response, NextFunction } from "express";
import { extractBearerToken, verifyAccessToken, AuthError, type TokenPayload } from "@/lib/auth/jwt";
import type { UserRole } from "@/db/schema";

export type AuthenticatedRequest = Request & {
  user: TokenPayload;
  tenantId: string;
};

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ success: false, errorCode: "TOKEN_MISSING" });
    }
    const payload = verifyAccessToken(token);
    if (!payload.tenantId) {
      return res.status(401).json({ success: false, errorCode: "TENANT_CONTEXT_MISSING" });
    }
    (req as AuthenticatedRequest).user = payload;
    (req as AuthenticatedRequest).tenantId = payload.tenantId;
    return next();
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(401).json({ success: false, errorCode: err.code, message: err.message });
    }
    return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID" });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ success: false, errorCode: "AUTH_REQUIRED" });
    }
    if (!roles.includes(authReq.user.role)) {
      return res.status(403).json({
        success: false,
        errorCode: "INSUFFICIENT_ROLE",
        requiredRoles: roles,
        actualRole: authReq.user.role,
      });
    }
    return next();
  };
}
