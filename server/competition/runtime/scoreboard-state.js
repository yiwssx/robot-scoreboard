"use strict";

const STATUSES = new Set(["READY", "RUNNING", "PAUSED", "FINISH"]);

function createScoreboardState(rules) {
  return {
    scoreA: 0,
    scoreB: 0,
    shotA: "",
    shotB: "",
    missionShotsA: ["", "", "", ""],
    missionShotsB: ["", "", "", ""],
    teamNames: ["TEAM A", "TEAM B"],
    teamWeights: {},
    teamSchools: {},
    teamNameA: "TEAM A",
    teamNameB: "TEAM B",
    teamNamesVisible: true,
    matchResults: [],
    currentMatchSaved: false,
    currentMatchSavedResultId: "",
    resultLocked: false,
    timeElapsed: 0,
    matchDuration: rules.matchDurationSeconds,
    status: "READY",
    timerHandle: null,
    timerStartedAtNs: null,
    timerBaseElapsedMs: 0,
  };
}

module.exports = { createScoreboardState, STATUSES };
