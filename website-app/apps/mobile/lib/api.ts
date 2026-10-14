/**
 * API Client for Fimto Concrete ERP
 * Handles authentication, token refresh, and API calls
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { API_BASE_URL } from "@/types";
import { getItem, setItem, removeItem, STORAGE_KEYS } from "./storage";
import { resolveApiBase } from "./server-url";
import { socket } from "./socket";
import type { AuthResponse, AuthUser, ApiResponse } from "@/types";
import type { SitesNearPoint } from "./sites";

class ApiClient {
  private client: AxiosInstance;
  /** Bare client for auth endpoints — bypasses the refresh interceptor
   *  so a failed refresh / logout can never re-enter (and deadlock) the queue. */
  private authClient: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  /** The free API host sleeps when idle and needs up to ~60 s to wake, so a
   *  30 s timeout would abort the very first request after a pause (usually the
   *  login). 90 s covers a cold start with room to spare. */
  private static readonly TIMEOUT = 90000;

  constructor() {
    const baseURL = resolveApiBase(API_BASE_URL);

    this.client = axios.create({
      baseURL,
      timeout: ApiClient.TIMEOUT,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.authClient = axios.create({
      baseURL,
      timeout: ApiClient.TIMEOUT,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor - attach token
    this.client.interceptors.request.use(async (config) => {
      // Re-resolve on every request so a server-URL change (set on the login
      // screen, or auto-discovered at start) applies without a restart.
      config.baseURL = resolveApiBase(API_BASE_URL);
      const token = await getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor - handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as (import("axios").InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;

          if (!this.isRefreshing) {
            this.isRefreshing = true;

            try {
              await this.refreshToken();
              // Retry original request
              const token = await getItem(STORAGE_KEYS.ACCESS_TOKEN);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              // Release queued requests, then retry this one
              this.failedQueue.forEach(({ resolve }) => resolve());
              this.failedQueue = [];
              return this.client(originalRequest);
            } catch (refreshError) {
              // Refresh failed - release queue and logout
              this.failedQueue.forEach(({ reject }) => reject(refreshError));
              this.failedQueue = [];
              await this.logout();
              return Promise.reject(refreshError);
            } finally {
              this.isRefreshing = false;
            }
          } else {
            // Queue requests while refreshing (resolved/rejected when refresh settles)
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then(() => {
              return this.client(originalRequest);
            });
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async login(phone: string, password: string): Promise<AuthResponse> {
    const response = await this.authClient.post<ApiResponse<AuthResponse>>("/auth/login", {
      phone,
      password,
    });

    const { accessToken, refreshToken, user } = response.data.data;

    // Store tokens
    await setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    await setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    await setItem(STORAGE_KEYS.USER, JSON.stringify(user));

    return response.data.data;
  }

  async refreshToken(): Promise<void> {
    const refreshToken = await getItem(STORAGE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) {
      throw new Error("No refresh token");
    }

    try {
      const response = await this.authClient.post<ApiResponse<AuthResponse>>("/auth/refresh", {
        refreshToken,
      });

      const { accessToken, refreshToken: newRefreshToken } = response.data.data;

      await setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      await setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken);

      // Keep the live socket authenticated with the fresh token.
      socket.refreshAuth().catch(() => {});
    } catch (error) {
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.authClient.post("/auth/logout");
    } catch {
      // Ignore logout errors
    } finally {
      await removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      await removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await removeItem(STORAGE_KEYS.USER);
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    // Never trust a locally persisted tree/profile object as an authenticated
    // session. Validate the access token against the server on app startup.
    const accessToken = await getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (!accessToken) return null;
    try {
      const response = await this.client.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
      const user = response.data.data.user;
      await setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      return user;
    } catch {
      await this.logout();
      return null;
    }
  }

  /**
   * Google Play compliant in-app account deletion. Purges the user row and all
   * tokens on the server, then clears local credentials regardless of outcome.
   */
  async deleteAccount(reason?: string): Promise<{ mode: string }> {
    try {
      const response = await this.client.post("/auth/delete-account", {
        confirmText: "DELETE",
        reason,
      });
      return { mode: response.data?.data?.mode ?? "HARD_DELETE" };
    } finally {
      await removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      await removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await removeItem(STORAGE_KEYS.USER);
    }
  }

  // ─── Plant & Branch Proximity ─────────────────────────────────────

  /**
   * Sites measured from a point on the phone, nearest first.
   *
   * Not /fleet/positions: that answers "where is the whole fleet" and is gated on
   * FLEET_POSITION_READ, which DRIVER does not hold — a driver does not see the
   * other trucks. This card only needs "where am I relative to our yards", so it
   * asks for the company's own sites and needs nothing beyond SITE_READ.
   */
  async getSitesNear(
    latitude: number,
    longitude: number
  ): Promise<SitesNearPoint | null> {
    try {
      const query = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
      });
      // Generic is the ApiResponse envelope, matching every other method here —
      // Axios does not unwrap the `{ success, data }` body on its own.
      const response =
        await this.client.get<ApiResponse<SitesNearPoint>>(
          `/sites/near?${query.toString()}`
        );
      return response.data.data;
    } catch {
      // Best-effort: this is an informational card, and a driver in a concrete
      // yard is often out of coverage. Failing loudly here would punish the
      // caller for something it can simply do without.
      return null;
    }
  }

  /** Verify a scanned delivery-ticket QR (auto-stamps ARR_SITE on success). */
  async verifyTicketQr(payload: Record<string, unknown>): Promise<any> {
    const response = await this.client.post("/dispatch/verify-ticket-qr", payload);
    return response.data.data;
  }

  // ─── Trip Endpoints ──────────────────────────────────────────────────────────

  async getMyActiveTrip(): Promise<any> {
    const response = await this.client.get("/dispatch/my-active");
    return response.data.data;
  }

  async getMyTripHistory(): Promise<any[]> {
    const response = await this.client.get("/dispatch/history");
    return response.data.data ?? [];
  }

  async updateTripCheckpoint(
    tripId: string,
    checkpoint: string,
    location?: { latitude: number; longitude: number }
  ): Promise<void> {
    await this.client.post(`/dispatch/${tripId}/checkpoint`, {
      checkpoint,
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
  }

  // ─── Delivery Challan (Package 1) ────────────────────────────────────────────

  async getTripChallan(tripId: string): Promise<any> {
    const response = await this.client.get(`/dispatch/${tripId}/challan`);
    return response.data.data;
  }

  async saveTripChallan(
    tripId: string,
    data: {
      receivedBy: string;
      customerSignature?: string;
      slumpMm?: number | null;
      temperatureC?: number | null;
      distanceKm?: number | null;
    }
  ): Promise<any> {
    const response = await this.client.post(`/dispatch/${tripId}/challan`, data);
    return response.data.data;
  }

  async sendLocationUpdate(
    tripId: string,
    vehicleId: string,
    location: {
      latitude: number;
      longitude: number;
      speed: number;
      heading: number;
      accuracy: number;
      driverId?: string;
    }
  ): Promise<void> {
    await this.client.post(`/dispatch/${tripId}/live-location`, {
      tripId,
      vehicleId,
      driverId: location.driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      deviceSpeedKmh: location.speed,
      headingDegrees: location.heading,
      accuracyMetres: location.accuracy,
      isMoving: location.speed > 0.5,
      capturedAt: new Date().toISOString(),
    });
  }

  // ─── Order Endpoints ─────────────────────────────────────────────────────────

  async getMyOrders(): Promise<any[]> {
    const response = await this.client.get("/orders");
    return response.data.data?.orders ?? [];
  }

  async createOrder(data: {
    clientId: string;
    siteId: string;
    mixDesignId: string;
    volumeM3: number;
    scheduledDate: string;
    location?: { latitude: number; longitude: number };
  }): Promise<any> {
    const response = await this.client.post("/orders", {
      clientId: data.clientId,
      deliverySiteId: data.siteId,
      mixDesignId: data.mixDesignId,
      totalVolumeM3: data.volumeM3,
      scheduledDate: data.scheduledDate,
      latitude: data.location?.latitude,
      longitude: data.location?.longitude,
    });
    return response.data.data;
  }

  async getOrderStatus(orderId: string): Promise<any> {
    const response = await this.client.get(`/orders/${orderId}`);
    return response.data.data;
  }

  // ─── Customer Portal Sharing (Epic 2) ───────────────────────────────────

  /** Issue a magic tracking link for one order (share with customer). */
  async shareOrder(
    orderId: string,
    label?: string
  ): Promise<{ token: string; link: string; scope: string; expiresAt: string }> {
    const response = await this.client.post("/portal/share", {
      scope: "ORDER",
      orderId,
      label,
    });
    return response.data.data;
  }

  /** Resolve a Firestore tree doc id → ERP order (Epic 13 unification). */
  async getOrderByRef(
    ref: string
  ): Promise<{ id: string; orderNumber: string; status: string } | null> {
    try {
      const response = await this.client.get(
        `/orders/by-ref?ref=${encodeURIComponent(ref)}`
      );
      return response.data.data;
    } catch {
      return null;
    }
  }

  // ─── E-Signature (Epic 3) ───────────────────────────────────────────────

  /** Upload the customer's sign-on-glass for a trip. */
  async saveTripSignature(
    tripId: string,
    signatureImage: string,
    signedBy: string
  ): Promise<{ id: string; tripNumber: string; signedBy: string; signedAt: string }> {
    const response = await this.client.post(`/dispatch/${tripId}/signature`, {
      signatureImage,
      signedBy,
    });
    return response.data.data;
  }

  // ─── HR Social (Epic 12) ────────────────────────────────────────────────

  async createHrRequest(data: {
    type: "LEAVE" | "ADVANCE" | "SALARY_CONFIRM" | "OTHER";
    startDate?: string;
    endDate?: string;
    amountSar?: number;
    referenceId?: string;
    reason?: string;
  }): Promise<any> {
    const response = await this.client.post("/hr/requests", data);
    return response.data.data;
  }

  async getMyHrRequests(): Promise<{ requests: any[] }> {
    const response = await this.client.get("/hr/requests/mine");
    return response.data.data;
  }

  async getHrRequests(status?: string): Promise<{ requests: any[] }> {
    const url = status ? `/hr/requests?status=${status}` : "/hr/requests";
    const response = await this.client.get(url);
    return response.data.data;
  }

  async reviewHrRequest(id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<any> {
    const response = await this.client.post(`/hr/requests/${id}/review`, {
      decision,
      reviewNote: note,
    });
    return response.data.data;
  }

  async getBroadcasts(): Promise<{ broadcasts: any[] }> {
    const response = await this.client.get("/hr/broadcasts");
    return response.data.data;
  }

  async markBroadcastRead(id: string): Promise<void> {
    await this.client.post(`/hr/broadcasts/${id}/read`);
  }

  async getBroadcastReads(id: string): Promise<number> {
    try {
      const response = await this.client.get(`/hr/broadcasts/${id}/reads`);
      return response.data.data?.reads ?? 0;
    } catch {
      return 0;
    }
  }

  async createBroadcast(data: { title: string; body: string; audience?: string[] }): Promise<any> {
    const response = await this.client.post("/hr/broadcasts", data);
    return response.data.data;
  }

  /** Register this device's Expo push token (best-effort). */
  async registerPushToken(token: string): Promise<void> {
    try {
      await this.client.post("/push/register", { token });
    } catch {
      // Push registration must never break login/session flows
    }
  }

  // ─── Geofence Attendance (Epic 12b) ─────────────────────────────────────

  /** Position ping → server derives check-in/out (best-effort). */
  async pingAttendance(latitude: number, longitude: number): Promise<any> {
    try {
      const response = await this.client.post("/hr/attendance/ping", {
        latitude,
        longitude,
      });
      return response.data.data;
    } catch {
      return null;
    }
  }

  async getMyAttendanceToday(): Promise<any> {
    try {
      const response = await this.client.get("/hr/attendance/today");
      return response.data.data?.attendance ?? null;
    } catch {
      return null;
    }
  }

  async getAttendanceReport(from: string, to: string): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/hr/attendance?from=${from}&to=${to}`
      );
      return response.data.data?.attendance ?? [];
    } catch {
      return [];
    }
  }

  async getDriverOvertime(from: string, to: string): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/hr/attendance/driver-trips?from=${from}&to=${to}`
      );
      return response.data.data?.drivers ?? [];
    } catch {
      return [];
    }
  }

  async getHrZones(): Promise<any[]> {
    try {
      const response = await this.client.get("/hr/zones");
      return response.data.data?.zones ?? [];
    } catch {
      return [];
    }
  }

  // ─── Drum Telemetry (Epic 5) ────────────────────────────────────────────

  /** Live drum RPM / temp / water + workability countdown for a trip. */
  async getTripTelemetry(tripId: string): Promise<any> {
    const response = await this.client.get(`/dispatch/${tripId}/telemetry`);
    return response.data.data;
  }

  /** Issue a full customer-portal link for a client (orders + statements). */
  async shareClientPortal(
    clientId: string,
    label?: string
  ): Promise<{ token: string; link: string; scope: string; expiresAt: string }> {
    const response = await this.client.post("/portal/share", {
      scope: "CLIENT",
      clientId,
      label,
    });
    return response.data.data;
  }

  // ─── Reference Data ──────────────────────────────────────────────────────────

  async getClients(): Promise<any[]> {
    const response = await this.client.get("/clients");
    return response.data.data;
  }

  async getSites(clientId: string): Promise<any[]> {
    const response = await this.client.get(`/clients/${clientId}/sites`);
    return response.data.data;
  }

  async getMixDesigns(): Promise<any[]> {
    const response = await this.client.get("/mix-designs");
    return response.data.data;
  }

  // ─── Dispatch board ─────────────────────────────────────────────────────────

  /**
   * The dispatcher's operational board: what must pour, what is running, what is
   * late, and what can be sent next. Read-only, so the screen can poll it.
   */
  async getDispatchBoard(params: { date?: string; horizonDays?: number } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.date) query.set("date", params.date);
    if (params.horizonDays !== undefined)
      query.set("horizonDays", String(params.horizonDays));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await this.client.get(`/dispatch/board${suffix}`);
    return response.data.data;
  }

  // ─── Batch plant ────────────────────────────────────────────────────────────

  async listBatchControllers(): Promise<any[]> {
    const response = await this.client.get("/plant/controllers");
    return response.data.data?.controllers ?? [];
  }

  /** Fire a batch, or book the consumption the plant reported. */
  async batchAction(
    controllerId: string,
    body: {
      action: "fire" | "record";
      mixDesignId?: string;
      ticketNumber?: string;
      batchSizeM3?: number;
    }
  ): Promise<any> {
    const response = await this.client.post(
      `/plant/controllers/${controllerId}/batch`,
      body
    );
    return response.data;
  }

  // ─── Customer self-service queue ────────────────────────────────────────────

  /** Requests customers started from the magic-link portal. */
  async getPortalRequests(params: { status?: string; limit?: number } = {}): Promise<any> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.limit) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const response = await this.client.get(`/portal/requests${suffix}`);
    return response.data.data;
  }

  /** Approving a NEW_ORDER materialises a real DRAFT order. */
  async decidePortalRequest(
    requestId: string,
    body: { decision: "APPROVED" | "REJECTED"; note?: string }
  ): Promise<any> {
    const response = await this.client.patch(`/portal/requests/${requestId}`, body);
    return response.data;
  }

  // ─── ZATCA e-invoicing ─────────────────────────────────────────────────────

  async getZatcaConfig(): Promise<any> {
    const response = await this.client.get("/finance/zatca/config");
    return response.data.data?.config;
  }

  async saveZatcaConfig(payload: Record<string, unknown>): Promise<any> {
    const response = await this.client.post("/finance/zatca/config", payload);
    return response.data;
  }

  async getZatcaStatus(): Promise<any> {
    const response = await this.client.get("/finance/zatca/status");
    return response.data.data;
  }

  /** Real handshake with Fatoora using the stored CSID. */
  async testZatcaConnection(): Promise<any> {
    const response = await this.client.post("/finance/zatca/test", {});
    return response.data;
  }

  // ─── Finance: cost & margin per m³ ──────────────────────────────────────────

  /**
   * Contribution margin per order from the mix recipe × the silo price per
   * tonne, plus whatever delivery cost the trips carry. The response also
   * reports which material prices are missing so the UI can say the report is
   * incomplete instead of showing a flattering number.
   */
  async getCostMargin(params: {
    from: string;
    to: string;
    limit?: number;
  }): Promise<any> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      limit: String(params.limit ?? 50),
    });
    const response = await this.client.get(`/finance/cost-margin?${query.toString()}`);
    return response.data.data;
  }

  // ─── Workshop / Driver Breakdown Reports ────────────────────────────────────

  async reportBreakdown(payload: {
    description: string;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    vehicleId?: string;
    vehicleCode?: string;
    tripId?: string;
    latitude?: number | null;
    longitude?: number | null;
    vehicleType?: string;
    photoBase64?: string | null;
    audioBase64?: string | null;
    capturedAt?: string;
  }): Promise<any> {
    const response = await this.client.post("/workshop/driver-report", payload);
    return response.data.data;
  }
}

export const api = new ApiClient();
