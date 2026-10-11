import AsyncStorage from "@react-native-async-storage/async-storage";

// Persists the driver's online *intent* so a killed/relaunched app can resume it.
// The socket itself can't survive a process kill — this just lets the app restore
// the Online UI and re-assert go_online on the next launch.
const ONLINE_KEY = "mbolodriver.wasOnline";

export async function saveOnline(isOnline) {
  try {
    await AsyncStorage.setItem(ONLINE_KEY, isOnline ? "1" : "0");
  } catch {
    // Non-fatal: resume is a convenience, not correctness.
  }
}

export async function loadOnline() {
  try {
    return (await AsyncStorage.getItem(ONLINE_KEY)) === "1";
  } catch {
    return false;
  }
}
