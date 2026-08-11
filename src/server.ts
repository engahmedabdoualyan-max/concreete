/**
 * ============================================================
 *  Fimto Soft — Standalone Realtime API Server
 * ============================================================
 *
 *  Express + Socket.io process that runs alongside the Next.js app to host
 *  the low-latency realtime + integration surface:
 *    • express-rate-limit on every public router (100 rpm / IP)
 *    • Socket.io with a 5s pingInterval heartbeat so drivers traversing
 *      low-coverage construction corridors are NOT dropped and their active
 *      trip state is preserved through transient disconnects.
 *
 *  Run:  npx tsx src/server.ts   (PORT defaults to 4000)
 */

import express from "express";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { apiRateLimiter, authRateLimiter } from "@/lib/rate-limit";
import { registerTenantSocket } from "@/lib/realtime/tenant-socket";
import dispatchRouter from "@/routes/dispatch";
import reportsRouter from "@/routes/reports";

export function createServer() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // honour X-Forwarded-For behind the LB
  app.use(express.json({ limit: "2mb" }));

  // ── Module 6: rate limiting across ALL public routers ────────────────────
  app.use("/api/auth", authRateLimiter);
  app.use("/api", apiRateLimiter);

  app.get("/api/health", (_req, res) =>
    res.json({ status: "healthy", realtime: true, timestamp: new Date().toISOString() })
  );

  // Business routers (each already enforces JWT + tenant scope internally)
  app.use("/api", dispatchRouter);
  app.use("/api", reportsRouter);

  const httpServer = http.createServer(app);

  // ── Module 5: WebSocket resilience — 5s heartbeat ────────────────────────
  const io = new SocketServer(httpServer, {
    cors: { origin: process.env.SOCKET_CORS_ORIGIN ?? "*" },
    // 5-second ping keeps NAT/cell connections warm and detects dead peers
    // quickly WITHOUT tearing down the driver's active trip state.
    pingInterval: 5_000,
    // Allow ~2 missed pings before declaring a peer gone. Client auto-reconnects.
    pingTimeout: 12_000,
    connectionStateRecovery: {
      // Buffer missed events for 2 minutes so a driver who drops into a tunnel
      // resumes the same session (and trip room membership) on reconnect.
      maxDisconnectionDuration: 2 * 60_000,
      skipMiddlewares: false,
    },
    transports: ["websocket", "polling"],
  });

  registerTenantSocket(io);

  return { app, httpServer, io };
}

// Boot when executed directly (not when imported for tests)
if (require.main === module) {
  const port = Number(process.env.REALTIME_PORT ?? 4000);
  const { httpServer } = createServer();
  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[fimto-realtime] listening on :${port} (pingInterval=5s, rate-limit=100rpm/IP)`);
  });
}
