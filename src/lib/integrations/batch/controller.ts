/**
 * ============================================================
 *  Batch-controller framework (Epic 10)
 * ============================================================
 *
 *  Providers:
 *   • MODBUS_TCP — generic PLC / Libra / gateway via register map
 *   • HTTP_GATEWAY — Marcotte-style REST gateways (configurable paths)
 *   • SIMULATOR — virtual plant for demos, dev and CI (no hardware)
 *
 *  A register map tells the Modbus provider where each signal lives:
 *    { status, progressPct, ticketId, weights: { cement, sand,
 *      gravel10, gravel20, gravel40, water, admixture1, admixture2 } }
 *  Each entry: { address, scale?, offset? }. Weights arrive in kg.
 * ============================================================
 */

export type BatchControllerProvider = "MODBUS_TCP" | "HTTP_GATEWAY" | "SIMULATOR";

export const BATCH_CONTROLLER_PROVIDERS: { id: BatchControllerProvider; label: string }[] = [
  { id: "MODBUS_TCP", label: "Modbus-TCP PLC (Libra / generic)" },
  { id: "HTTP_GATEWAY", label: "HTTP Gateway (Marcotte-style)" },
  { id: "SIMULATOR", label: "Simulator (no hardware)" },
];

export interface RegisterEntry {
  address: number;
  scale?: number;
  offset?: number;
}

export interface BatchRegisterMap {
  status: RegisterEntry; // 0=idle 1=batching 2=done 3=alarm
  progressPct?: RegisterEntry;
  ticketId?: RegisterEntry;
  weights?: Partial<
    Record<
      | "cement"
      | "sand"
      | "gravel10"
      | "gravel20"
      | "gravel40"
      | "water"
      | "admixture1"
      | "admixture2",
      RegisterEntry
    >
  >;
}

export interface BatchControllerStatus {
  online: boolean;
  state: "IDLE" | "BATCHING" | "DONE" | "ALARM" | "OFFLINE";
  progressPct: number | null;
  ticketId: number | null;
  latencyMs: number;
  message: string;
}

export interface BatchTicketData {
  ticketId: string;
  batchedAt: string;
  weightsKg: Record<string, number>;
  totalKg: number;
  source: BatchControllerProvider;
}

export interface BatchController {
  provider: BatchControllerProvider;
  testConnection(
    settings: Record<string, unknown>
  ): Promise<{ ok: boolean; message: string; latencyMs?: number }>;
  readStatus(
    settings: Record<string, unknown>
  ): Promise<BatchControllerStatus>;
  readTicket(
    settings: Record<string, unknown>,
    ticketNumber?: string
  ): Promise<BatchTicketData>;
}
