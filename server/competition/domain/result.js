"use strict";

const { parseShotTime } = require("./time");
const { normalizeTeamWeight } = require("./team");

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

module.exports = { getWinnerInfoFromValues };
