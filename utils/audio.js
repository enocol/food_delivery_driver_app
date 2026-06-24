import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const GLASS_SOUND = require("../assets/sounds/breaking-glass.mp3");

export async function playBreakingGlass() {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    });
    const player = createAudioPlayer(GLASS_SOUND);
    player.play();
    player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) player.remove();
    });
  } catch {
    // sound failure never blocks going online
  }
}
