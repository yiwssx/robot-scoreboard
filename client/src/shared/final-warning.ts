import { useEffect, useState } from "preact/hooks";
import type { ScoreboardState } from "../core/contracts";

let warningAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let lastWarningSecond: number | null = null;

export function unlockWarningAudio() {
  if (!warningAudio) {
    warningAudio = new Audio("/assets/videoplayback.wav");
    warningAudio.preload = "auto";
  }
  audioUnlocked = true;
}

function playWarning() {
  if (!audioUnlocked) return;
  unlockWarningAudio();
  if (!warningAudio) return;
  try {
    warningAudio.currentTime = 0;
    void warningAudio.play().catch(() => {});
  } catch {}
}

export function useFinalWarning(state: ScoreboardState) {
  const threshold = Number(state.finalWarningSeconds) > 0 ? Number(state.finalWarningSeconds) : 10;
  const warning = state.status === "RUNNING" && state.remainingSeconds > 0 && state.remainingSeconds <= threshold;
  const [, tick] = useState(0);

  useEffect(() => {
    const unlock = () => unlockWarningAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!warning) {
      lastWarningSecond = null;
      tick((value) => value + 1);
      return;
    }
    if (lastWarningSecond !== state.remainingSeconds) {
      lastWarningSecond = state.remainingSeconds;
      playWarning();
    }
    tick((value) => value + 1);
  }, [warning, state.remainingSeconds]);

  return warning;
}
