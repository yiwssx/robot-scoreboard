"use strict";

function parseShotTime(value) {
  const match = String(value || "").trim().match(/^(\d+)[.:](\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
  return minutes * 60 + seconds;
}

function formatTime(seconds) {
  const safe = Math.max(Math.floor(Number(seconds) || 0), 0);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, "0")}.${String(remaining).padStart(2, "0")}`;
}

function normalizeCorrectionTime(value, maxSeconds) {
  if (value === "" || value === null || value === undefined) return "";
  const seconds = parseShotTime(value);
  if (seconds === null) return null;
  if (Number.isFinite(Number(maxSeconds)) && seconds > Number(maxSeconds)) return null;
  return formatTime(seconds);
}

function normalizeMatchDuration(value, fallback = 180) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600) return fallback;
  return Math.floor(seconds);
}

function elapsedSecondsFromClock(baseElapsedMs, startedAtNs, nowNs, durationSeconds) {
  const base = Math.max(Number(baseElapsedMs) || 0, 0);
  const deltaNs = nowNs > startedAtNs ? nowNs - startedAtNs : 0n;
  const deltaMs = Number(deltaNs / 1000000n);
  const durationMs = Math.max(Number(durationSeconds) || 0, 0) * 1000;
  return Math.floor(Math.min(base + deltaMs, durationMs) / 1000);
}

module.exports = {
  parseShotTime,
  formatTime,
  normalizeCorrectionTime,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
};
