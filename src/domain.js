"use strict";

function cleanTeamName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanSchoolName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function normalizeTeamWeight(value) {
  if (value === "" || value === null || value === undefined) return null;
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const rounded = Math.round(weight * 10) / 10;
  return rounded > 0 ? rounded : null;
}

function normalizeMissionShots(value) {
  const shots = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => {
    const shot = shots[index];
    if (shot === "" || shot === null || shot === undefined) return "";
    return String(shot);
  });
}

function parseShotTime(value) {
  const match = String(value || "").trim().match(/^(\d+)[.:](\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;
  return minutes * 60 + seconds;
}

function normalizeCorrectionTime(value, maxSeconds) {
  if (value === "" || value === null || value === undefined) return "";
  const seconds = parseShotTime(value);
  if (seconds === null) return null;
  if (Number.isFinite(Number(maxSeconds)) && seconds > Number(maxSeconds)) return null;
  return formatTime(seconds);
}

function formatTime(seconds) {
  const safe = Math.max(Math.floor(Number(seconds) || 0), 0);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, "0")}.${String(remaining).padStart(2, "0")}`;
}

function normalizeScoreDelta(value, allowedValues = [-20, -10, 10, 20]) {
  const point = Number(value);
  const allowed = new Set((Array.isArray(allowedValues) ? allowedValues : []).map(Number));
  return Number.isFinite(point) && allowed.has(point) ? point : null;
}

function getMissionPoint(mission, missionPoints = { 1: 10, 2: 20, 3: 20, 4: 20 }) {
  const missionNumber = Number(mission);
  if (!Number.isInteger(missionNumber) || missionNumber < 1 || missionNumber > 4) return null;
  const point = Number(missionPoints[missionNumber]);
  return Number.isFinite(point) && point >= 0 ? point : null;
}

function normalizeTeam(value) {
  const team = String(value || "").toUpperCase();
  return team === "A" || team === "B" ? team : null;
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

function getWinnerInfoFromValues(scoreA, scoreB, shotA, shotB, weightA, weightB, nameA, nameB) {
  const a = Number(scoreA) || 0;
  const b = Number(scoreB) || 0;
  if (a > b) return { winner: "A", winnerName: nameA || "TEAM A" };
  if (b > a) return { winner: "B", winnerName: nameB || "TEAM B" };

  const shotSecondsA = parseShotTime(shotA);
  const shotSecondsB = parseShotTime(shotB);
  if (shotSecondsA !== null && shotSecondsB !== null) {
    if (shotSecondsA < shotSecondsB) return { winner: "A", winnerName: nameA || "TEAM A" };
    if (shotSecondsB < shotSecondsA) return { winner: "B", winnerName: nameB || "TEAM B" };
  }

  const safeWeightA = normalizeTeamWeight(weightA);
  const safeWeightB = normalizeTeamWeight(weightB);
  const equalShots = shotSecondsA !== null && shotSecondsB !== null && shotSecondsA === shotSecondsB;
  if (equalShots && safeWeightA !== null && safeWeightB !== null) {
    if (safeWeightA < safeWeightB) return { winner: "A", winnerName: nameA || "TEAM A" };
    if (safeWeightB < safeWeightA) return { winner: "B", winnerName: nameB || "TEAM B" };
  }

  return { winner: "DRAW", winnerName: "DRAW" };
}

module.exports = {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  parseShotTime,
  normalizeCorrectionTime,
  formatTime,
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeam,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
};
