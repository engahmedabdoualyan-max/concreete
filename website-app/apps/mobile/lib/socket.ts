/**
 * Socket.io Client — WebSocket Resilience & Heartbeat (Module 5)
 *
 * Configured for construction-corridor reliability:
 *   • reconnection: true
 *   • reconnectionAttempts: Infinity  (never give up)
 *   • timeout: 10000
 *   • connectionStateRecovery honoured by the server (5s pingInterval) so the
 *     driver's active trip room + session survive transient tunnel dropouts.
 */

import { io, Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_RECONNECT } from "@/types";
import { getItem, STORAGE_KEYS } from "./storage";

type StatusListener = (status: "connected" | "disconnected" | "reconnecting") => void;

class SocketClient {
  private socket: Socket | null = null;
  private statusListeners = new Set<StatusListener>();

  async connect(): Promise<void> {
    const token = await getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!token) {
      console.warn("[Socket] Cannot connect without token");
      return;
    }
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"], // polling fallback for weak coverage
      reconnection: SOCKET_RECONNECT.reconnection,
      reconnectionAttempts: SOCKET_RECONNECT.reconnectionAttempts, // Infinity
      reconnectionDelay: SOCKET_RECONNECT.reconnectionDelay,
      reconnectionDelayMax: SOCKET_RECONNECT.reconnectionDelayMax,
      timeout: SOCKET_RECONNECT.timeout, // 10000
    });

    this.socket.on("connect", () => {
      console.log("[Socket] Connected:", this.socket?.id);
      this.emitStatus("connected");
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
      this.emitStatus("disconnected");
      // Server-initiated disconnects still auto-reconnect except explicit kicks.
      if (reason === "io server disconnect") {
        this.socket?.connect();
      }
    });

    this.socket.io.on("reconnect_attempt", (attempt) => {
      console.log("[Socket] Reconnect attempt", attempt);
      this.emitStatus("reconnecting");
    });

    this.socket.io.on("reconnect", (attempt) => {
      console.log("[Socket] Reconnected after", attempt, "attempts");
      this.emitStatus("connected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error.message);
      this.emitStatus("reconnecting");
    });
  }

  /**
   * Update the socket auth after a token refresh. Re-hands-hakes if currently
   * connected so the server re-validates the fresh access token and re-joins rooms.
   */
  async refreshAuth(): Promise<void> {
    const token = await getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!this.socket) return;
    if (!token) {
      this.disconnect();
      return;
    }
    this.socket.auth = { token };
    if (this.socket.connected) {
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  private emitStatus(status: "connected" | "disconnected" | "reconnecting") {
    this.statusListeners.forEach((l) => l(status));
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: unknown, callback?: (response: unknown) => void): void {
    if (!this.socket?.connected) {
      console.warn("[Socket] Not connected, cannot emit:", event);
      return;
    }
    this.socket.emit(event, data, callback);
  }

  /**
   * Emit with an acknowledgement, resolving false if not connected or timed out.
   * Used by the offline-sync engine to confirm a queued event was accepted.
   */
  emitWithAck(event: string, data: unknown, timeoutMs = 8000): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) return resolve(false);
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);
      this.socket.emit(event, data, (resp: { success?: boolean } | undefined) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(resp?.success !== false);
        }
      });
    });
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.socket?.on(event, handler);
  }

  off(event: string, handler: (data: unknown) => void): void {
    this.socket?.off(event, handler);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socket = new SocketClient();
