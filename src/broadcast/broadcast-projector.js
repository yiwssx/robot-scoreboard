"use strict";

function missionTimes(value) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => String(source[index] || ""));
}

function currentResult(data) {
  const id = String(data.currentMatchSavedResultId || "");
  const results = Array.isArray(data.matchResults) ? data.matchResults : [];
  const result = results.find((item) => item && item.id === id) || null;
  return result
    ? {
        winner: result.winner || null,
        winnerName: result.winnerName || "",
        locked: Boolean(result.locked || data.resultLocked),
      }
    : {
        winner: null,
        winnerName: "",
        locked: Boolean(data.resultLocked),
      };
}

function projectBroadcastState(data = {}) {
  return Object.freeze({
    version: 1,
    generatedAt: new Date().toISOString(),
    match: Object.freeze({
      status: String(data.status || "READY"),
      time: String(data.time || "00.00"),
      timeElapsed: Number(data.timeElapsed) || 0,
      remainingSeconds: Number(data.remainingSeconds) || 0,
      matchDuration: Number(data.matchDuration) || 0,
    }),
    teamA: Object.freeze({
      name: String(data.teamNameA || "TEAM A"),
      school: String(data.teamSchoolA || ""),
      score: Number(data.scoreA) || 0,
      shot: String(data.shotA || ""),
      missions: Object.freeze(missionTimes(data.missionShotsA)),
      visible: data.teamNamesVisible !== false,
    }),
    teamB: Object.freeze({
      name: String(data.teamNameB || "TEAM B"),
      school: String(data.teamSchoolB || ""),
      score: Number(data.scoreB) || 0,
      shot: String(data.shotB || ""),
      missions: Object.freeze(missionTimes(data.missionShotsB)),
      visible: data.teamNamesVisible !== false,
    }),
    result: Object.freeze(currentResult(data)),
  });
}

module.exports = { projectBroadcastState };
