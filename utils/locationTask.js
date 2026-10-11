import { AppState } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getSocket } from "../config/socket";

// Keep-alive layer: while the driver is online, a background location task runs
// behind an Android foreground service (and iOS background-location mode). Its
// real value is keeping the app process — and therefore the socket connection —
// alive while backgrounded, so the driver stays Online and can receive offers
// over the socket. It also streams location to the server.
export const LOCATION_TASK = "mbolo-driver-location";

// Defined at module scope so it is registered as soon as this file is imported
// (see index.js), including when the OS relaunches the app in the background.
TaskManager.defineTask(LOCATION_TASK, ({ data, error }) => {
  if (error) return;
  const locations = data?.locations;
  if (!locations || locations.length === 0) return;

  // Foreground location is already handled by HomeScreen's watcher, so only emit
  // from here when backgrounded to avoid duplicate updates.
  if (AppState.currentState === "active") return;

  const loc = locations[locations.length - 1];
  const socket = getSocket();
  if (socket?.connected && loc?.coords) {
    socket.emit("update_location", {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
  }
});

// Start when the driver goes online. Requires foreground + background ("Always")
// location permission. Returns a status the caller can act on:
//   "ok"            — updates running (or already running)
//   "no-foreground" — foreground location denied
//   "no-background" — "Allow all the time" not granted (caller should prompt;
//                     on Android 11+ this can only be set from Settings)
//   "error"         — unexpected failure
// Safe to call repeatedly.
export async function startBackgroundLocation() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== "granted") return "no-foreground";
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      return "no-background";
    }

    const alreadyRunning =
      await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (alreadyRunning) return "ok";

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 10000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // iOS-only: marks this as navigation-grade location so iOS manages
      // background updates and battery accordingly (ignored on Android).
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: "You're online",
        notificationBody: "Mbolo Delivery is receiving delivery requests",
        notificationColor: "#ff5a1f",
      },
    });
    return "ok";
  } catch (e) {
    if (__DEV__) console.warn("[keepalive] start failed:", e?.message);
    return "error";
  }
}

// Stop when the driver goes offline or signs out. Safe to call when not running.
export async function stopBackgroundLocation() {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (e) {
    if (__DEV__) console.warn("[keepalive] stop failed:", e?.message);
  }
}
