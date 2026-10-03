import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const ONLINE_SOUND = require("../assets/sounds/online.wav");
const OFFLINE_SOUND = require("../assets/sounds/offline.wav");

async function playSound(source) {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
    const player = createAudioPlayer(source);
    player.play();
    player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) player.remove();
    });
  } catch {
    // sound failure never blocks the status change
  }
}

/** Confirmation chime played when the driver goes online. */
export function playOnline() {
  return playSound(ONLINE_SOUND);
}

/** Short note played when the driver goes offline. */
export function playOffline() {
  return playSound(OFFLINE_SOUND);
}
