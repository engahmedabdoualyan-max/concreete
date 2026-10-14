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

/**
 * A command to send to the plant controller.
 *
 * `startBatch` is what turns a signed-off mix design into a running batch:
 * the design code plus the target weights per material, already scaled to the
 * uint16 the panel expects. The operator still confirms on the vendor panel
 * unless the controller is explicitly commissioned for remote writes.
 */
export interface BatchCommand {
  /** startBatch = fire, abortBatch = stop */
  action: "startBatch" | "abortBatch";
  /** design code the panel should run (its own numeric/ASCII id) */
  designCode?: number;
  /** target kg per m³, keyed like the register map weights */
  targetWeightsKg?: Record<string, number>;
}

export interface BatchCommandResult {
  ok: boolean;
  written: number;
  message: string;
  latencyMs?: number;
  /** true when the write was simulated, not sent to hardware */
  simulated?: boolean;
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
  /**
   * Optional: only providers commissioned for writes implement this. Callers
   * must check `canWriteRemote(settings)` first and fall back to "the operator
   * fires it on the panel" when it is unavailable.
   */
  writeCommand?(
    settings: Record<string, unknown>,
    command: BatchCommand
  ): Promise<BatchCommandResult>;
}
