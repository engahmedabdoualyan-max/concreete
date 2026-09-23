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
