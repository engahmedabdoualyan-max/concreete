/**
 * Modbus-TCP batch controller (Epic 10).
 *
 * Settings:
 *   { host, port?, unitId?, registerMap: BatchRegisterMap,
 *     allowRemoteWrite?: false }
 *
 * v1 is READ-ONLY by design (status/progress/ticket weights).
 * Remote batch firing stays on the vendor panel until a supervised
 * write path is commissioned per plant.
 */

import {
  type BatchController,
  type BatchControllerStatus,
  type BatchRegisterMap,
  type BatchTicketData,
} from "./controller";
import { readHoldingRegisters, scaleRegister } from "./modbus-tcp";

function getMap(settings: Record<string, unknown>): BatchRegisterMap {
  const map = settings.registerMap as BatchRegisterMap | undefined;
  if (!map || typeof map.status?.address !== "number") {
    throw new Error("registerMap.status.address is required (see commissioning docs)");
  }
  return map;
}

function connOpts(settings: Record<string, unknown>) {
  const host = settings.host as string | undefined;
  if (!host) throw new Error("host is required");
  return {
    host,
    port: typeof settings.port === "number" ? settings.port : 502,
    unitId: typeof settings.unitId === "number" ? settings.unitId : 1,
    timeoutMs: 4000,
  };
}

function decodeState(raw: number): BatchControllerStatus["state"] {
  if (raw === 1) return "BATCHING";
  if (raw === 2) return "DONE";
  if (raw === 3) return "ALARM";
  return "IDLE";
}

async function readEntry(
  opts: ReturnType<typeof connOpts>,
  address: number,
  scale = 1,
  offset = 0
): Promise<{ scaled: number; latencyMs: number }> {
  const { values, latencyMs } = await readHoldingRegisters(opts, address, 1);
  return { scaled: scaleRegister(values[0], scale, offset).scaled, latencyMs };
}

export const modbusController: BatchController = {
  provider: "MODBUS_TCP",

  async testConnection(settings) {
    try {
      const map = getMap(settings);
      const { latencyMs } = await readEntry(
        connOpts(settings),
        map.status.address,
        map.status.scale ?? 1,
        map.status.offset ?? 0
      );
      return { ok: true, message: "PLC reachable — status register read OK", latencyMs };
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
      const map = getMap(settings);
      const opts = connOpts(settings);
      const [stateRaw, progress, ticket] = await Promise.all([
        readEntry(opts, map.status.address, map.status.scale ?? 1, map.status.offset ?? 0),
        map.progressPct
          ? readEntry(opts, map.progressPct.address, map.progressPct.scale ?? 1, map.progressPct.offset ?? 0)
          : Promise.resolve({ scaled: NaN, latencyMs: 0 }),
        map.ticketId
          ? readEntry(opts, map.ticketId.address, map.ticketId.scale ?? 1, map.ticketId.offset ?? 0)
          : Promise.resolve({ scaled: NaN, latencyMs: 0 }),
      ]);
      return {
        online: true,
        state: decodeState(Math.round(stateRaw.scaled)),
        progressPct: Number.isFinite(progress.scaled) ? Math.round(progress.scaled) : null,
        ticketId: Number.isFinite(ticket.scaled) ? Math.round(ticket.scaled) : null,
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

  async readTicket(settings): Promise<BatchTicketData> {
    const map = getMap(settings);
    const opts = connOpts(settings);
    const weightsKg: Record<string, number> = {};
    const weights = (map.weights ?? {}) as NonNullable<BatchRegisterMap["weights"]>;
    // Batch consecutive addresses into single reads where possible
    const sorted = (Object.keys(weights) as (keyof typeof weights)[])
      .map((name) => {
        const e = weights[name]!;
        return { name, address: e.address, scale: e.scale ?? 1, offset: e.offset ?? 0 };
      })
      .sort((a, b) => a.address - b.address);

    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (
        j + 1 < sorted.length &&
        sorted[j + 1].address === sorted[j].address + (j - i + 1) &&
        j - i + 1 < 16
      ) {
        j++;
      }
      const qty = j - i + 1;
      const { values } = await readHoldingRegisters(opts, sorted[i].address, qty);
      for (let k = 0; k < qty; k++) {
        const e = sorted[i + k];
        weightsKg[e.name] = Math.round(scaleRegister(values[k], e.scale, e.offset).scaled * 100) / 100;
      }
      i = j + 1;
    }

    const ticket = map.ticketId
      ? Math.round(
          (await readEntry(opts, map.ticketId.address, map.ticketId.scale ?? 1, map.ticketId.offset ?? 0)).scaled
        )
      : 0;
    const totalKg = Math.round(Object.values(weightsKg).reduce((s, v) => s + v, 0) * 100) / 100;
    return {
      ticketId: String(ticket),
      batchedAt: new Date().toISOString(),
      weightsKg,
      totalKg,
      source: "MODBUS_TCP",
    };
  },
};
