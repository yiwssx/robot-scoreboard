"use strict";

const {
  normalizeTeam,
  normalizeScoreDelta,
  getMissionPoint,
  getMissionShots,
  formatTime,
} = require("../domain");

function createScoringService({ state, rules, runtime, matchService }) {
  function addScore(team, point, context = {}) {
    const safeTeam = normalizeTeam(team);
    const safePoint = normalizeScoreDelta(point, rules.scoreAdjustments);
    if (!safeTeam || safePoint === null) return { ok: false, code: "INVALID_COMMAND" };
    matchService.syncTimerFromClock(context);
    const guard = matchService.requireRunning();
    if (guard) return guard;
    if (safeTeam === "A") state.scoreA = Math.max(state.scoreA + safePoint, 0);
    else state.scoreB = Math.max(state.scoreB + safePoint, 0);
    runtime.log("SCORE_ADJUST", { team: safeTeam, delta: safePoint }, context);
    runtime.emit();
    return { ok: true, point: safePoint };
  }

  function hasMissionShot(team, mission) {
    const shots = getMissionShots(state, team);
    const index = Number(mission) - 1;
    return Boolean(shots && index >= 0 && index < 4 && shots[index] !== "");
  }

  function recordMissionShot(team, mission) {
    const safeTeam = normalizeTeam(team);
    const index = Number(mission) - 1;
    const shots = getMissionShots(state, safeTeam);
    if (!shots || index < 0 || index >= 4 || shots[index] !== "") return false;
    const shotTime = formatTime(state.timeElapsed);
    shots[index] = shotTime;
    if (index === 3) {
      if (safeTeam === "A" && !state.shotA) state.shotA = shotTime;
      if (safeTeam === "B" && !state.shotB) state.shotB = shotTime;
    }
    return true;
  }

  function missionScore(team, mission, context = {}) {
    const safeTeam = normalizeTeam(team);
    const point = getMissionPoint(mission, rules.missions);
    if (!safeTeam || point === null) return { ok: false, code: "INVALID_COMMAND" };
    matchService.syncTimerFromClock(context);
    const guard = matchService.requireRunning();
    if (guard) return guard;
    if (hasMissionShot(safeTeam, mission)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };
    if (safeTeam === "A") state.scoreA += point;
    else state.scoreB += point;
    recordMissionShot(safeTeam, mission);
    runtime.log("MISSION_SCORE", { team: safeTeam, mission: Number(mission), point }, context);
    runtime.emit();
    return { ok: true, point };
  }

  function missionShot(team, mission, context = {}) {
    const safeTeam = normalizeTeam(team);
    if (!safeTeam || getMissionPoint(mission, rules.missions) === null) return { ok: false, code: "INVALID_COMMAND" };
    matchService.syncTimerFromClock(context);
    const guard = matchService.requireRunning();
    if (guard) return guard;
    if (!recordMissionShot(safeTeam, mission)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };
    runtime.log("MISSION_SHOT", { team: safeTeam, mission: Number(mission) }, context);
    runtime.emit();
    return { ok: true };
  }

  function endWithBonus(team, context = {}) {
    return missionScore(team, 4, context);
  }

  return {
    addScore,
    missionScore,
    missionShot,
    endWithBonus,
  };
}

module.exports = { createScoringService };
