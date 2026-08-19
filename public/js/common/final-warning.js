(function () {
  "use strict";

  let audioContext = null;
  let warningAudio = null;
  let warningAudioSourceIndex = 0;
  let warningAudioUnavailable = false;
  let warningAudioPlaying = false;
  let lastWarningSecond = null;
  let warningStarted = false;
  const sources = [
    "/assets/videoplayback.wav", "/assets/videoplayback.mp3", "/assets/videoplayback.m4a",
    "/assets/videoplayback.ogg", "/assets/videoplayback.webm", "/assets/videoplayback.mp4",
  ];

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function getWarningAudio() {
    if (!warningAudio) {
      warningAudio = new Audio();
      warningAudio.preload = "auto";
      warningAudio.addEventListener("ended", () => { warningAudioPlaying = false; });
      warningAudio.addEventListener("pause", () => { warningAudioPlaying = false; });
    }
    return warningAudio;
  }

  function stopWarningAudio() {
    if (!warningAudio) return;
    try { warningAudio.pause(); warningAudio.currentTime = 0; } catch {}
    warningAudioPlaying = false;
  }

  function beep() {
    const context = getAudioContext();
    if (!context || context.state !== "running") return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(920, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(now); oscillator.stop(now + 0.2);
  }

  async function trySource(index) {
    if (index >= sources.length) throw new Error("no audio source");
    const audio = getWarningAudio();
    audio.src = sources[index];
    audio.load();
    warningAudioSourceIndex = index;
    try {
      audio.currentTime = 0;
      audio.muted = false;
      await audio.play();
      warningAudioPlaying = true;
    } catch {
      return trySource(index + 1);
    }
  }

  function playWarningAudio() {
    if (warningAudioUnavailable || warningAudioPlaying) return;
    trySource(warningAudioSourceIndex).catch(() => {
      warningAudioUnavailable = true;
      warningAudioPlaying = false;
      beep();
    });
  }

  function unlockWarningAudio() {
    getAudioContext();
    getWarningAudio();
  }

  function applyFinalWarning(data) {
    const timeElement = document.getElementById("time");
    if (!timeElement) return;
    const remaining = Number(data.remainingSeconds);
    const threshold = Number(data.finalWarningSeconds) > 0 ? Number(data.finalWarningSeconds) : 10;
    const shouldWarn = data.status === "RUNNING" && Number.isFinite(remaining) && remaining > 0 && remaining <= threshold;
    timeElement.classList.toggle("final-warning", shouldWarn);

    if (!shouldWarn) {
      lastWarningSecond = null;
      warningStarted = false;
      if (data.status !== "FINISH") stopWarningAudio();
      return;
    }
    if (!warningStarted) {
      warningStarted = true;
      lastWarningSecond = remaining;
      playWarningAudio();
      return;
    }
    if (remaining !== lastWarningSecond) {
      lastWarningSecond = remaining;
      if (warningAudioUnavailable) beep();
    }
  }

  document.addEventListener("pointerdown", unlockWarningAudio, { once: true });
  document.addEventListener("keydown", unlockWarningAudio, { once: true });
  window.applyFinalWarning = applyFinalWarning;
  window.unlockWarningAudio = unlockWarningAudio;
})();
