import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";

const DEVICE_ID_STORAGE_KEY = "mbolodriver.pushDeviceId";

// The caller retries transient failures but must not loop on a refusal, so the
// two are reported separately rather than both collapsing to null.
export const PUSH_PERMISSION_DENIED = "permission_denied";
export const PUSH_TRANSIENT_ERROR = "transient_error";

async function getOrCreateDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const nextId = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

export async function registerForPushNotificationsAsync() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Delivery offers",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#ff5a1f",
      });
    }

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      if (__DEV__) {
        console.warn("[push] Notification permission was not granted");
      }
      return { ok: false, reason: PUSH_PERMISSION_DENIED };
    }

    // Reaching Expo's token service needs the network, so this is one of the
    // steps that legitimately fails offline and is worth retrying.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenResponse?.data || null;

    if (!token) {
      return { ok: false, reason: PUSH_TRANSIENT_ERROR };
    }

    const deviceId = await getOrCreateDeviceId();
    const appVersion = Constants.expoConfig?.version || "1.0.0";
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || null;

    return {
      ok: true,
      payload: {
        fcm_token: token,
        platform: Platform.OS,
        device_id: deviceId,
        app_version: appVersion,
        locale,
        is_active: true,
      },
    };
  } catch (error) {
    if (__DEV__) {
      console.error("[push] Failed to register for push notifications:", error);
    }
    return { ok: false, reason: PUSH_TRANSIENT_ERROR, error };
  }
}
