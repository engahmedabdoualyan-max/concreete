/**
 * ============================================================
 *  Minimal Modbus-TCP client (Epic 10 — PLC integration)
 * ============================================================
 *
 *  Dependency-free Modbus-TCP over node:net for batch-plant
 *  controllers (Libra / Marcotte gateways / generic PLCs):
 *   • FC03 Read Holding Registers
 *   • FC16 Write Multiple Registers (gated — used only when the
 *     connection explicitly enables remote writes)
 *
 *  Runs in the Node.js runtime (API routes), never in the browser.
 * ============================================================
 */

import net from "node:net";

export interface ModbusResult {
  values: number[];
  latencyMs: number;
}

function mbapHeader(transactionId: number, unitId: number, pduLength: number): Buffer {
  const h = Buffer.alloc(7);
  h.writeUInt16BE(transactionId & 0xffff, 0);
  h.writeUInt16BE(0, 2); // protocol = Modbus
  h.writeUInt16BE(pduLength + 1, 4); // unit id + PDU
  h.writeUInt8(unitId, 6);
  return h;
}

function readFrame(
  socket: net.Socket,
  expectedBytes: number,
  timeoutMs: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Modbus timeout"));
    }, timeoutMs);
    const onData = (data: Buffer) => {
      chunks.push(data);
      received += data.length;
      if (received >= expectedBytes) {
        clearTimeout(timer);
        socket.off("data", onData);
        resolve(Buffer.concat(chunks));
      }
    };
    socket.on("data", onData);
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export interface ModbusTcpOptions {
  host: string;
  port?: number;
  unitId?: number;
  timeoutMs?: number;
}

let transactionCounter = 0;

/**
 * FC03 — read `quantity` holding registers starting at `address`
 * (0-based). Returns raw uint16 values (scaling is per register map).
 */
export async function readHoldingRegisters(
  opts: ModbusTcpOptions,
  address: number,
  quantity: number
): Promise<ModbusResult> {
  const { host, port = 502, unitId = 1, timeoutMs = 3000 } = opts;
  if (quantity < 1 || quantity > 125) throw new Error("quantity must be 1–125");

  const started = Date.now();
  const socket = new net.Socket();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.connect(port, host, () => resolve());
    setTimeout(() => reject(new Error("Modbus connect timeout")), timeoutMs);
  });

  try {
    const tid = (transactionCounter = (transactionCounter + 1) & 0xffff);
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(0x03, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(quantity, 3);
    socket.write(Buffer.concat([mbapHeader(tid, unitId, pdu.length), pdu]));

    // MBAP(7) + func(1) + byteCount(1) + data(2*qty)
    const frame = await readFrame(socket, 7 + 2 + quantity * 2, timeoutMs);
    if (frame.readUInt16BE(0) !== tid) throw new Error("Modbus transaction mismatch");
    if (frame[7] & 0x80) throw new Error(`Modbus exception ${frame[8]}`);
    const byteCount = frame[8];
    if (byteCount !== quantity * 2) throw new Error("Modbus short read");
    const values: number[] = [];
    for (let i = 0; i < quantity; i++) {
      values.push(frame.readUInt16BE(9 + i * 2));
    }
    return { values, latencyMs: Date.now() - started };
  } finally {
    socket.destroy();
  }
}

/**
 * FC16 — write `values` into consecutive holding registers.
 *
 * This is the write path that turns the integration from "read the panel" into
 * "run the plant": firing a batch means writing the design code and the target
 * weights into the controller's command registers. It is only ever called when
 * the controller is explicitly configured with `allowRemoteWrite: true`, and
 * the caller is expected to have been commissioned on that panel (see
 * deploy/BATCHING-COMMISSIONING.md).
 */
export async function writeMultipleRegisters(
  opts: ModbusTcpOptions,
  address: number,
  values: number[]
): Promise<{ written: number; latencyMs: number }> {
  const { host, port = 502, unitId = 1, timeoutMs = 5000 } = opts;
  if (values.length < 1 || values.length > 123) {
    throw new Error("FC16 accepts 1–123 registers");
  }
  for (const v of values) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) {
      throw new Error("FC16 values must be uint16 (0–65535)");
    }
  }

  const started = Date.now();
  const socket = new net.Socket();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.connect(port, host, () => resolve());
    setTimeout(() => reject(new Error("Modbus connect timeout")), timeoutMs);
  });

  try {
    const tid = (transactionCounter = (transactionCounter + 1) & 0xffff);
    const pdu = Buffer.alloc(6 + values.length * 2);
    pdu.writeUInt8(0x10, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(values.length, 3);
    pdu.writeUInt8(values.length * 2, 5);
    values.forEach((v, i) => pdu.writeUInt16BE(v, 6 + i * 2));
    socket.write(Buffer.concat([mbapHeader(tid, unitId, pdu.length), pdu]));

    // MBAP(7) + func(1) + address(2) + qty(2)
    const frame = await readFrame(socket, 7 + 5, timeoutMs);
    if (frame.readUInt16BE(0) !== tid) throw new Error("Modbus transaction mismatch");
    if (frame[7] & 0x80) throw new Error(`Modbus exception ${frame[8]}`);
    if (frame.readUInt16BE(8) !== address || frame.readUInt16BE(10) !== values.length) {
      throw new Error("Modbus write acknowledgement mismatch");
    }
    return { written: values.length, latencyMs: Date.now() - started };
  } finally {
    socket.destroy();
  }
}

/** FC06 — write a single holding register (used for simple start/stop words). */
export async function writeSingleRegister(
  opts: ModbusTcpOptions,
  address: number,
  value: number
): Promise<{ latencyMs: number }> {
  const { host, port = 502, unitId = 1, timeoutMs = 5000 } = opts;
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("FC06 value must be uint16 (0–65535)");
  }
  const started = Date.now();
  const socket = new net.Socket();
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.connect(port, host, () => resolve());
    setTimeout(() => reject(new Error("Modbus connect timeout")), timeoutMs);
  });
  try {
    const tid = (transactionCounter = (transactionCounter + 1) & 0xffff);
    const pdu = Buffer.alloc(5);
    pdu.writeUInt8(0x06, 0);
    pdu.writeUInt16BE(address, 1);
    pdu.writeUInt16BE(value, 3);
    socket.write(Buffer.concat([mbapHeader(tid, unitId, pdu.length), pdu]));
    const frame = await readFrame(socket, 7 + 5, timeoutMs);
    if (frame.readUInt16BE(0) !== tid) throw new Error("Modbus transaction mismatch");
    if (frame[7] & 0x80) throw new Error(`Modbus exception ${frame[8]}`);
    if (frame.readUInt16BE(8) !== address || frame.readUInt16BE(10) !== value) {
      throw new Error("Modbus write acknowledgement mismatch");
    }
    return { latencyMs: Date.now() - started };
  } finally {
    socket.destroy();
  }
}

export interface DecodedRegister {
  raw: number;
  scaled: number;
}

/** Apply { scale, offset } from a register map entry. */
export function scaleRegister(
  raw: number,
  scale = 1,
  offset = 0
): DecodedRegister {
  return { raw, scaled: raw * scale + offset };
}
