"use strict";

const ALLOWED_SCORE_DELTAS = new Set([-20, -10, 10, 20]);
const MISSION_POINTS = Object.freeze({ 1: 10, 2: 20, 3: 20, 4: 20 });

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
  const roundedWeight = Math.round(weight * 10) / 10;
  return roundedWeight > 0 ? roundedWeight : null;
}

function normalizeMissionShots(value) {
  const shots = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => {
    const shotValue = shots[index];
    if (shotValue === "" || shotValue === null || shotValue === undefined) return "";
    return String(shotValue);
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

function formatTime(seconds) {
  const safeSeconds = Math.max(Math.floor(Number(seconds) || 0), 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}.${String(remainingSeconds).padStart(2, "0")}`;
}

function normalizeScoreDelta(value) {
  const point = Number(value);
  return Number.isFinite(point) && ALLOWED_SCORE_DELTAS.has(point) ? point : null;
}

function getMissionPoint(mission) {
  const missionNumber = Number(mission);
  return Number.isInteger(missionNumber) ? MISSION_POINTS[missionNumber] ?? null : null;
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

function getWinnerInfoFromValues(firstScore, secondScore, firstShot, secondShot, firstWeight, secondWeight, firstName, secondName) {
  const safeScoreA = Number(firstScore) || 0;
  const safeScoreB = Number(secondScore) || 0;

  if (safeScoreA > safeScoreB) return { winner: "A", winnerName: firstName || "TEAM A" };
  if (safeScoreB > safeScoreA) return { winner: "B", winnerName: secondName || "TEAM B" };

  const shotSecondsA = parseShotTime(firstShot);
  const shotSecondsB = parseShotTime(secondShot);

  if (shotSecondsA !== null && shotSecondsB !== null) {
    if (shotSecondsA < shotSecondsB) return { winner: "A", winnerName: firstName || "TEAM A" };
    if (shotSecondsB < shotSecondsA) return { winner: "B", winnerName: secondName || "TEAM B" };
  }

  const safeWeightA = normalizeTeamWeight(firstWeight);
  const safeWeightB = normalizeTeamWeight(secondWeight);
  const equalShots = shotSecondsA !== null && shotSecondsB !== null && shotSecondsA === shotSecondsB;

  if (equalShots && safeWeightA !== null && safeWeightB !== null) {
    if (safeWeightA < safeWeightB) return { winner: "A", winnerName: firstName || "TEAM A" };
    if (safeWeightB < safeWeightA) return { winner: "B", winnerName: secondName || "TEAM B" };
  }

  return { winner: "DRAW", winnerName: "DRAW" };
}

module.exports = {
  ALLOWED_SCORE_DELTAS,
  MISSION_POINTS,
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  parseShotTime,
  formatTime,
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeam,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
};
