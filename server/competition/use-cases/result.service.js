"use strict";

const crypto = require("node:crypto");
const {
  normalizeMissionShots,
  normalizeScoreDelta,
  normalizeCorrectionTime,
  normalizeTeam,
  getMissionShots,
  getWinnerInfoFromValues,
} = require("../domain");

const MAX_RESULTS = 200;

function createResultService({ state, rules, persistence, runtime }) {
  function normalizeMatchResult(result) {
    const safe = result && typeof result === "object" ? result : {};
    const winner = getWinnerInfoFromValues(
      safe.scoreA,
      safe.scoreB,
      safe.shotA,
      safe.shotB,
      safe.teamWeightA,
      safe.teamWeightB,
      safe.teamNameA,
      safe.teamNameB
    );
    return { ...safe, winner: winner.winner, winnerName: winner.winnerName, locked: Boolean(safe.locked) };
  }

  async function loadResults() {
    const saved = await persistence.firstExistingJson("match-results.json", "match-results.json", []);
    state.matchResults = Array.isArray(saved) ? saved.map(normalizeMatchResult).slice(0, MAX_RESULTS) : [];
  }

  function winnerInfo() {
    return getWinnerInfoFromValues(
      state.scoreA,
      state.scoreB,
      state.shotA,
      state.shotB,
      runtime.getTeamWeight(state.teamNameA),
      runtime.getTeamWeight(state.teamNameB),
      state.teamNameA,
      state.teamNameB
    );
  }

  function currentResultFields() {
    const winner = winnerInfo();
    return {
      teamNameA: state.teamNameA,
      teamNameB: state.teamNameB,
      teamWeightA: runtime.getTeamWeight(state.teamNameA),
      teamWeightB: runtime.getTeamWeight(state.teamNameB),
      teamSchoolA: runtime.getTeamSchool(state.teamNameA),
      teamSchoolB: runtime.getTeamSchool(state.teamNameB),
      scoreA: state.scoreA,
      scoreB: state.scoreB,
      shotA: state.shotA,
      shotB: state.shotB,
      missionShotsA: normalizeMissionShots(state.missionShotsA),
      missionShotsB: normalizeMissionShots(state.missionShotsB),
      elapsedSeconds: state.timeElapsed,
      elapsedTime: require("../domain").formatTime(state.timeElapsed),
      matchDuration: state.matchDuration,
      winner: winner.winner,
      winnerName: winner.winnerName,
    };
  }

  function resetCurrentMatchSave() {
    state.currentMatchSaved = false;
    state.currentMatchSavedResultId = "";
    state.resultLocked = false;
  }

  function nextMatchNumber() {
    return state.matchResults.reduce((highest, result) => {
      const n = Number(result && result.matchNumber);
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0) + 1;
  }

  function saveCurrentMatchResult(mode, context = {}) {
    if (state.currentMatchSaved) return false;
    const result = {
      id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      matchNumber: nextMatchNumber(),
      savedAt: new Date().toISOString(),
      mode: mode === "auto" ? "auto" : "manual",
      locked: false,
      lockedAt: null,
      ...currentResultFields(),
    };
    state.matchResults = [result, ...state.matchResults].slice(0, MAX_RESULTS);
    state.currentMatchSaved = true;
    state.currentMatchSavedResultId = result.id;
    state.resultLocked = false;
    runtime.saveResults();
    runtime.log("RESULT_SAVED", { resultId: result.id, matchNumber: result.matchNumber, mode: result.mode }, context);
    return true;
  }

  function updateCurrentMatchResult() {
    if (!state.currentMatchSaved || !state.currentMatchSavedResultId) return false;
    const index = state.matchResults.findIndex((item) => item && item.id === state.currentMatchSavedResultId);
    if (index < 0) return false;
    state.matchResults[index] = { ...state.matchResults[index], ...currentResultFields(), locked: state.resultLocked };
    runtime.saveResults();
    return true;
  }

  function correctResult(data, context = {}) {
    if (state.status !== "FINISH" || !state.currentMatchSaved) return { ok: false, code: "RESULT_NOT_AVAILABLE" };
    if (state.resultLocked) return { ok: false, code: "RESULT_LOCKED" };
    const safe = data && typeof data === "object" ? data : {};
    const type = String(safe.type || "");
    const team = normalizeTeam(safe.team);
    if (!team) return { ok: false, code: "INVALID_TEAM" };

    if (type === "score") {
      const delta = normalizeScoreDelta(safe.delta, rules.scoreAdjustments);
      if (delta === null) return { ok: false, code: "INVALID_SCORE_DELTA" };
      if (team === "A") state.scoreA = Math.max(state.scoreA + delta, 0);
      else state.scoreB = Math.max(state.scoreB + delta, 0);
      runtime.log("RESULT_CORRECT_SCORE", { team, delta }, context);
    } else if (type === "shot") {
      const value = normalizeCorrectionTime(safe.value, state.matchDuration);
      if (value === null) return { ok: false, code: "INVALID_TIME" };
      if (team === "A") state.shotA = value;
      else state.shotB = value;
      runtime.log("RESULT_CORRECT_SHOT", { team, value }, context);
    } else if (type === "mission-shot") {
      const mission = Number(safe.mission);
      if (!Number.isInteger(mission) || mission < 1 || mission > 4) return { ok: false, code: "INVALID_MISSION" };
      const value = normalizeCorrectionTime(safe.value, state.matchDuration);
      if (value === null) return { ok: false, code: "INVALID_TIME" };
      const shots = getMissionShots(state, team);
      shots[mission - 1] = value;
      if (mission === 4) {
        if (team === "A") state.shotA = value;
        else state.shotB = value;
      }
      runtime.log("RESULT_CORRECT_MISSION_SHOT", { team, mission, value }, context);
    } else {
      return { ok: false, code: "INVALID_CORRECTION" };
    }

    updateCurrentMatchResult();
    runtime.emit();
    return { ok: true, result: currentResultFields() };
  }

  function finalizeResult(context = {}) {
    if (state.status !== "FINISH" || !state.currentMatchSaved || !state.currentMatchSavedResultId) {
      return { ok: false, code: "RESULT_NOT_AVAILABLE" };
    }
    if (state.resultLocked) return { ok: true, alreadyLocked: true };
    state.resultLocked = true;
    const index = state.matchResults.findIndex((item) => item && item.id === state.currentMatchSavedResultId);
    if (index >= 0) {
      state.matchResults[index] = {
        ...state.matchResults[index],
        ...currentResultFields(),
        locked: true,
        lockedAt: new Date().toISOString(),
      };
      runtime.saveResults();
    }
    runtime.log("RESULT_FINALIZED", { resultId: state.currentMatchSavedResultId }, context);
    runtime.emit();
    return { ok: true };
  }

  function deleteResult(data, context = {}) {
    if (state.status === "RUNNING" || state.status === "PAUSED") {
      return { ok: false, code: "MATCH_ACTIVE", deleted: false, matchResults: state.matchResults };
    }
    const id = String(data && data.id || "").trim();
    if (!id) return { ok: false, code: "INVALID_RESULT", deleted: false, matchResults: state.matchResults };
    const before = state.matchResults.length;
    state.matchResults = state.matchResults.filter((item) => item && item.id !== id);
    const deleted = before !== state.matchResults.length;
    if (deleted) {
      if (state.currentMatchSavedResultId === id) resetCurrentMatchSave();
      runtime.saveResults();
      runtime.log("RESULT_DELETE", { resultId: id }, context);
      runtime.emit();
    }
    return { ok: deleted, deleted, matchResults: state.matchResults };
  }

  return {
    loadResults,
    currentResultFields,
    resetCurrentMatchSave,
    saveCurrentMatchResult,
    updateCurrentMatchResult,
    correctResult,
    finalizeResult,
    deleteResult,
  };
}

module.exports = { createResultService, MAX_RESULTS };
