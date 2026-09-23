/**
 * HTTP-gateway batch controller (Epic 10) — Marcotte-style REST gateways.
 *
 * Settings:
 *   { baseUrl, apiKey?, statusPath? (default /api/status),
 *     ticketPath? (default /api/ticket), timeoutMs? }
 *
 * Expected status JSON: { state, progressPct?, ticketId? }
 * Expected ticket JSON: { ticketId, batchedAt?, weightsKg: {...} }
 */

import type {
  BatchController,
  BatchControllerStatus,
  BatchTicketData,
} from "./controller";

function base(settings: Record<string, unknown>): string {
  const b = settings.baseUrl as string | undefined;
  if (!b) throw new Error("baseUrl is required");
  return b.replace(/\/$/, "");
}

function headers(settings: Record<string, unknown>): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (typeof settings.apiKey === "string" && settings.apiKey) {
    h.Authorization = `Bearer ${settings.apiKey}`;
  }
  return h;
}

async function getJson(url: string, settings: Record<string, unknown>): Promise<unknown> {
  const timeoutMs = typeof settings.timeoutMs === "number" ? settings.timeoutMs : 5000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: headers(settings), signal: ctrl.signal });
    if (!res.ok) throw new Error(`Gateway HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function normState(raw: unknown): BatchControllerStatus["state"] {
  const s = String(raw ?? "").toUpperCase();
  if (["BATCHING", "RUNNING", "PRODUCING", "1"].includes(s)) return "BATCHING";
  if (["DONE", "COMPLETE", "COMPLETED", "2"].includes(s)) return "DONE";
  if (["ALARM", "ERROR", "FAULT", "3"].includes(s)) return "ALARM";
  if (["IDLE", "READY", "STANDBY", "0"].includes(s)) return "IDLE";
  return "OFFLINE";
}

export const httpGatewayController: BatchController = {
  provider: "HTTP_GATEWAY",

  async testConnection(settings) {
    const started = Date.now();
    try {
      const path = (settings.statusPath as string) || "/api/status";
      await getJson(`${base(settings)}${path}`, settings);
      return { ok: true, message: "Gateway reachable", latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Connection failed",
      };
    }
  },

  async readStatus(settings): Promise<BatchControllerStatus> {
    const started = Date.now();
    try {
      const path = (settings.statusPath as string) || "/api/status";
      const body = (await getJson(`${base(settings)}${path}`, settings)) as Record<string, unknown>;
      return {
        online: true,
        state: normState(body.state ?? body.status),
        progressPct:
          typeof body.progressPct === "number" ? Math.round(body.progressPct) : null,
        ticketId:
          typeof body.ticketId === "number"
            ? body.ticketId
            : typeof body.ticket === "number"
              ? body.ticket
              : null,
        latencyMs: Date.now() - started,
        message: "Live read OK",
      };
    } catch (err) {
      return {
        online: false,
        state: "OFFLINE",
        progressPct: null,
        ticketId: null,
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : "Read failed",
      };
    }
  },

  async readTicket(settings, ticketNumber): Promise<BatchTicketData> {
    const basePath = (settings.ticketPath as string) || "/api/ticket";
    const qs = ticketNumber ? `?number=${encodeURIComponent(ticketNumber)}` : "";
    const body = (await getJson(`${base(settings)}${basePath}${qs}`, settings)) as {
      ticketId?: string | number;
      batchedAt?: string;
      weightsKg?: Record<string, number>;
    };
    const weightsKg: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.weightsKg ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) weightsKg[k] = v;
    }
    const totalKg = Math.round(Object.values(weightsKg).reduce((s, v) => s + v, 0) * 100) / 100;
    return {
      ticketId: String(body.ticketId ?? ticketNumber ?? "0"),
      batchedAt: body.batchedAt ?? new Date().toISOString(),
      weightsKg,
      totalKg,
      source: "HTTP_GATEWAY",
    };
  },
};
