"use strict";

function normalizeMissionShots(value) {
  const shots = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => {
    const shot = shots[index];
    if (shot === "" || shot === null || shot === undefined) return "";
    return String(shot);
  });
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

function getMissionShots(state, team) {
  if (team === "A") return state.missionShotsA;
  if (team === "B") return state.missionShotsB;
  return null;
}

module.exports = {
  normalizeMissionShots,
  normalizeScoreDelta,
  getMissionPoint,
  getMissionShots,
};
