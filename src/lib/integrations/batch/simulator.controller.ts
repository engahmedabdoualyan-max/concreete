/**
 * Simulator batch controller (Epic 10) — virtual plant.
 *
 * Zero hardware: synthesizes a believable batch cycle (idle →
 * batching with rising progress → done) plus deterministic ticket
 * weights derived from the requested mix. Used for demos, frontend
 * development and CI. NEVER used for production dispatch.
 *
 * Settings: { cycleSeconds? (default 120), seedMix? }
 */

import type {
  BatchCommandResult,
  BatchController,
  BatchControllerStatus,
  BatchTicketData,
} from "./controller";

const BOOT = Date.now();

function simState(cycleSeconds: number): { state: BatchControllerStatus["state"]; progress: number } {
  const t = Math.floor((Date.now() - BOOT) / 1000) % cycleSeconds;
  const batchingEnd = Math.floor(cycleSeconds * 0.7);
  if (t < 5) return { state: "IDLE", progress: 0 };
  if (t < batchingEnd) {
    return { state: "BATCHING", progress: Math.round(((t - 5) / (batchingEnd - 5)) * 100) };
  }
  return { state: "DONE", progress: 100 };
}

export const simulatorController: BatchController = {
  provider: "SIMULATOR",

  async testConnection() {
    return { ok: true, message: "Simulator online (virtual plant)", latencyMs: 1 };
  },

  async readStatus(settings): Promise<BatchControllerStatus> {
    const cycle = typeof settings.cycleSeconds === "number" ? settings.cycleSeconds : 120;
    const s = simState(Math.max(20, cycle));
    return {
      online: true,
      state: s.state,
      progressPct: s.progress,
      ticketId: 1000 + (Math.floor(Date.now() / 1000 / cycle) % 9000),
      latencyMs: 1,
      message: "Simulated read — not production data",
    };
  },

  async readTicket(settings, ticketNumber): Promise<BatchTicketData> {
    // Deterministic pseudo-weights for a standard 1 m³ C30-ish load
    const seed = Number(ticketNumber ?? 1) || 1;
    const jitter = (base: number) => Math.round(base * (1 + ((seed * 7919) % 7 - 3) / 500) * 10) / 10;
    const weightsKg = {
      cement: jitter(350),
      sand: jitter(750),
      gravel20: jitter(1100),
      water: jitter(175),
      admixture1: jitter(2.5),
    };
    const totalKg = Math.round(Object.values(weightsKg).reduce((s, v) => s + v, 0) * 10) / 10;
    return {
      ticketId: String(ticketNumber ?? seed),
      batchedAt: new Date().toISOString(),
      weightsKg,
      totalKg,
      source: "SIMULATOR",
    };
  },

  /**
   * The simulator accepts the same commands a commissioned panel would, so the
   * whole flow (fire a batch → plant reports DONE → consumption is recorded)
   * can be exercised in CI with no hardware on the network.
   */
  async writeCommand(settings, command): Promise<BatchCommandResult> {
    const targets = command.targetWeightsKg ?? {};
    const total = Object.values(targets).reduce((a, b) => a + (Number(b) || 0), 0);
    return {
      ok: true,
      written: Object.keys(targets).length + 1,
      message:
        command.action === "startBatch"
          ? `Simulated batch start for design ${command.designCode ?? "?"} — ${Math.round(total)} kg target`
          : "Simulated abort acknowledged",
      latencyMs: 1,
      simulated: true,
    };
  },
};
