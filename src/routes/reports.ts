/** Express router wrapper for the multi-tenant reporting engine. */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "@/lib/express-auth";
import { generateExcelReport, generatePdfReport } from "@/services/report-service";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/reports", async (req, res) => {
  const auth = req as AuthenticatedRequest;
  const format = String(req.query.format ?? "pdf");
  const filters = {
    tenantId: String(req.query.tenantId ?? auth.tenantId),
    from: String(req.query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString()),
    to: String(req.query.to ?? new Date().toISOString()),
    vehicleTypes: req.query.vehicleType ? ([] as string[]).concat(req.query.vehicleType as string | string[]) : [],
    mixDesignIds: req.query.mixDesignId ? ([] as string[]).concat(req.query.mixDesignId as string | string[]) : [],
    driverIds: req.query.driverId ? ([] as string[]).concat(req.query.driverId as string | string[]) : [],
    locale: (req.query.locale ?? "en") as "en" | "ar" | "ur" | "hi",
  };
  const report = format === "xlsx"
    ? await generateExcelReport({ tenantId: auth.tenantId, userId: auth.user.sub, role: auth.user.role, permissions: auth.user.permissions }, filters)
    : await generatePdfReport({ tenantId: auth.tenantId, userId: auth.user.sub, role: auth.user.role, permissions: auth.user.permissions }, filters);
  res.setHeader("Content-Type", report.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
  res.send(report.buffer);
});

export default reportsRouter;
