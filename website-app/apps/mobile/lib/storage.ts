/**
 * Secure storage wrapper for React Native
 * Uses Expo SecureStore on native, AsyncStorage fallback for web
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const isNative = Platform.OS !== "web";

export async function setItem(key: string, value: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(key, value);
  } else {
    await AsyncStorage.setItem(key, value);
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (isNative) {
    return await SecureStore.getItemAsync(key);
  } else {
    return await AsyncStorage.getItem(key);
  }
}

export async function removeItem(key: string): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await AsyncStorage.removeItem(key);
  }
}

// Storage keys
export const STORAGE_KEYS = {
  ACCESS_TOKEN: "fimto_access_token",
  REFRESH_TOKEN: "fimto_refresh_token",
  USER: "fimto_user",
  LAST_SYNC: "fimto_last_sync",
} as const;
