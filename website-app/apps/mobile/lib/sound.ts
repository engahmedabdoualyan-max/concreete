import { Audio } from "expo-av";

let sound: Audio.Sound | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

/** Play a short notification beep (used when a decision arrives / new order). */
export async function playAlertSound(): Promise<void> {
  if (!enabled) return;
  try {
    if (!sound) {
      const { sound: s } = await Audio.Sound.createAsync(
        require("@/assets/sounds/beep.wav")
      );
      sound = s;
    }
    await sound.replayAsync();
  } catch {
    // sound is best-effort; never break the UI for it
  }
}
