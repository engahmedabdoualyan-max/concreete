/**
 * Push registration helper (Epic 12)
 * Best-effort Expo push-token enrolment after login.
 * NEVER throws — missing permissions, dev clients without a
 * projectId, or absent native module all fail silently.
 */

import { Platform } from "react-native";
import { api } from "./api";

export async function registerForPush(): Promise<void> {
  try {
    if (Platform.OS === "web") return;

    const Notifications = await import("expo-notifications");
    const Constants = await import("expo-constants");

    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } =
      existing === "granted"
        ? { status: existing }
        : await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const projectId =
      Constants.default?.expoConfig?.extra?.eas?.projectId ??
      Constants.default?.easConfig?.projectId;
    if (!projectId) return; // dev client without EAS project — skip

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token?.data) {
      await api.registerPushToken(token.data);
    }
  } catch {
    // Push is a bonus channel — login/session must never break
  }
}
