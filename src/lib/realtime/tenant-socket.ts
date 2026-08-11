/**
 * Tenant-aware Socket.io event layer.
 * All rooms are prefixed with tenant:<tenantId> to prevent cross-plant leaks.
 */

import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { processLocationUpdate } from "@/lib/services/realtime-gps.service";

export function tenantRoom(tenantId: string, name: string): string {
  return `tenant:${tenantId}:${name}`;
}

export function registerTenantSocket(io: Server) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, "");
      if (!token) return next(new Error("TOKEN_MISSING"));
      const user = verifyAccessToken(token);
      if (!user.tenantId) return next(new Error("TENANT_CONTEXT_MISSING"));
      socket.data.user = user;
      socket.data.tenantId = user.tenantId;
      socket.join(tenantRoom(user.tenantId, "all"));
      socket.join(tenantRoom(user.tenantId, user.role.toLowerCase()));
      return next();
    } catch (err) {
      return next(err instanceof Error ? err : new Error("TOKEN_INVALID"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const tenantId = socket.data.tenantId as string;
    socket.on("join:room", (room: string) => socket.join(tenantRoom(tenantId, room)));

    socket.on("driver:location_update", async (payload, ack) => {
      try {
        if (payload.tenantId && payload.tenantId !== tenantId) {
          throw new Error("TENANT_MISMATCH");
        }
        const result = await processLocationUpdate(payload, socket.data.user.sub);
        if (result.broadcastEvent.shouldBroadcast) {
          io.to(tenantRoom(tenantId, "admin-live-map")).emit(
            "fleet:vehicle_position",
            result.broadcastEvent.payload
          );
        }
        if (result.autoTriggeredArrSite) {
          io.to(tenantRoom(tenantId, "dispatch")).emit("trip:checkpoint_updated", {
            tripId: payload.tripId,
            checkpoint: "ARR_SITE",
            source: "GEOFENCE_AUTO_TRIGGER",
            timestamp: new Date().toISOString(),
          });
        }
        ack?.({ success: true, data: result });
      } catch (err) {
        ack?.({ success: false, message: err instanceof Error ? err.message : "GPS failed" });
      }
    });
  });
}

export function emitTenantCritical(io: Server, tenantId: string, event: string, payload: unknown) {
  io.to(tenantRoom(tenantId, "admin-live-map")).emit(event, payload);
  io.to(tenantRoom(tenantId, "dispatch")).emit(event, payload);
}
