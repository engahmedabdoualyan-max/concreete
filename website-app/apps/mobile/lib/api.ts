/**
 * API Client for Fimto Concrete ERP
 * Handles authentication, token refresh, and API calls
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { API_BASE_URL } from "@/types";
import { getItem, setItem, removeItem, STORAGE_KEYS } from "./storage";
import { socket } from "./socket";
import type { AuthResponse, AuthUser, ApiResponse } from "@/types";

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

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.authClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor - attach token
    this.client.interceptors.request.use(async (config) => {
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
    const userJson = await getItem(STORAGE_KEYS.USER);
    if (!userJson) return null;
    return JSON.parse(userJson);
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
