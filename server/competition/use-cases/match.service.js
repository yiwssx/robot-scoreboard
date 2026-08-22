"use strict";

const {
  normalizeMissionShots,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
  formatTime,
} = require("../domain");
const { STATUSES } = require("../runtime/scoreboard-state");

const TIMER_POLL_MS = 100;

function createMatchService({ state, rules, persistence, runtime, resultService }) {
  async function loadLiveState() {
    const saved = await persistence.firstExistingJson("live-match-state.json", "live-match-state.json", null);
    if (!saved || typeof saved !== "object") return { recovered: false, fromStatus: null };

    const scoreA = Number(saved.scoreA);
    const scoreB = Number(saved.scoreB);
    state.scoreA = Number.isFinite(scoreA) ? Math.max(Math.floor(scoreA), 0) : 0;
    state.scoreB = Number.isFinite(scoreB) ? Math.max(Math.floor(scoreB), 0) : 0;
    state.matchDuration = normalizeMatchDuration(saved.matchDuration, rules.matchDurationSeconds);

    const elapsed = Number(saved.timeElapsed);
    state.timeElapsed = Number.isFinite(elapsed)
      ? Math.min(Math.max(Math.floor(elapsed), 0), state.matchDuration)
      : 0;
    state.shotA = String(saved.shotA || "");
    state.shotB = String(saved.shotB || "");
    state.missionShotsA = normalizeMissionShots(saved.recordedMissionShotsA || saved.missionShotsA);
    state.missionShotsB = normalizeMissionShots(saved.recordedMissionShotsB || saved.missionShotsB);
    state.teamNameA = runtime.addTeamNameToList(saved.teamNameA || state.teamNameA) || state.teamNameA;
    state.teamNameB = runtime.addTeamNameToList(saved.teamNameB || state.teamNameB) || state.teamNameB;
    runtime.ensureDistinctSelectedTeams();

    const fromStatus = String(saved.status || "READY").toUpperCase();
    if (fromStatus === "RUNNING") state.status = "PAUSED";
    else if (fromStatus === "STOP") state.status = state.timeElapsed > 0 ? "PAUSED" : "READY";
    else state.status = STATUSES.has(fromStatus) ? fromStatus : "READY";

    const resultId = String(saved.currentMatchSavedResultId || "");
    state.currentMatchSaved = Boolean(
      saved.currentMatchSaved && resultId && state.matchResults.some((result) => result && result.id === resultId)
    );
    state.currentMatchSavedResultId = state.currentMatchSaved ? resultId : "";
    const current = state.matchResults.find((result) => result && result.id === state.currentMatchSavedResultId);
    state.resultLocked = state.currentMatchSaved
      ? Boolean(saved.resultLocked || (current && current.locked))
      : false;

    return { recovered: true, fromStatus };
  }

  function clearTimer() {
    if (state.timerHandle !== null) clearInterval(state.timerHandle);
    state.timerHandle = null;
    state.timerStartedAtNs = null;
  }

  function finishTimer(context = {}) {
    clearTimer();
    state.timeElapsed = state.matchDuration;
    state.status = "FINISH";
    const finishTime = formatTime(state.matchDuration);
    if (!state.shotA) state.shotA = finishTime;
    if (!state.shotB) state.shotB = finishTime;
    resultService.saveCurrentMatchResult("auto", context);
    runtime.log("MATCH_FINISH", { resultReviewRequired: true }, context);
  }

  function syncTimerFromClock(context = {}) {
    if (state.status !== "RUNNING" || state.timerStartedAtNs === null) return false;
    const next = elapsedSecondsFromClock(
      state.timerBaseElapsedMs,
      state.timerStartedAtNs,
      process.hrtime.bigint(),
      state.matchDuration
    );
    const changed = next !== state.timeElapsed;
    state.timeElapsed = next;
    if (state.timeElapsed >= state.matchDuration) {
      finishTimer(context);
      return true;
    }
    return changed;
  }

  function startTimer(context = {}) {
    if (state.timerHandle !== null || state.status === "RUNNING") return { ok: false, code: "MATCH_ALREADY_RUNNING" };
    if (state.status === "FINISH") return { ok: false, code: "MATCH_FINISHED" };
    if (state.status !== "READY" && state.status !== "PAUSED") return { ok: false, code: "INVALID_STATE" };
    state.status = "RUNNING";
    state.timerBaseElapsedMs = state.timeElapsed * 1000;
    state.timerStartedAtNs = process.hrtime.bigint();
    state.timerHandle = setInterval(() => {
      if (syncTimerFromClock()) runtime.emit();
    }, TIMER_POLL_MS);
    runtime.log(state.timeElapsed === 0 ? "MATCH_START" : "MATCH_RESUME", {}, context);
    runtime.emit();
    return { ok: true, status: state.status };
  }

  function stopTimer(context = {}) {
    if (state.status !== "RUNNING") return { ok: false, code: "MATCH_NOT_RUNNING" };
    syncTimerFromClock(context);
    clearTimer();
    if (state.status !== "FINISH") state.status = "PAUSED";
    runtime.log("MATCH_PAUSE", {}, context);
    runtime.emit();
    return { ok: true, status: state.status };
  }

  function canPrepareNextMatch() {
    if (state.status === "RUNNING" || state.status === "PAUSED") return { ok: false, code: "MATCH_ACTIVE" };
    if (state.status === "FINISH" && state.currentMatchSaved && !state.resultLocked) {
      return { ok: false, code: "RESULT_NOT_LOCKED" };
    }
    return { ok: true };
  }

  function resetMatchState(seconds) {
    clearTimer();
    state.matchDuration = normalizeMatchDuration(seconds, rules.matchDurationSeconds);
    state.timeElapsed = 0;
    state.scoreA = 0;
    state.scoreB = 0;
    state.shotA = "";
    state.shotB = "";
    state.missionShotsA = ["", "", "", ""];
    state.missionShotsB = ["", "", "", ""];
    state.status = "READY";
    resultService.resetCurrentMatchSave();
  }

  function resetTimer(seconds = rules.matchDurationSeconds, context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    resetMatchState(seconds);
    runtime.log("MATCH_PREPARE", { matchDuration: state.matchDuration }, context);
    runtime.emit();
    return { ok: true, matchDuration: state.matchDuration };
  }

  function resetScore(context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    const duration = state.matchDuration;
    resetMatchState(duration);
    runtime.log("MATCH_RESET", { matchDuration: state.matchDuration }, context);
    runtime.emit();
    return { ok: true };
  }

  function resetAll(context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    resetMatchState(rules.matchDurationSeconds);
    runtime.log("MATCH_RESET_ALL", { matchDuration: state.matchDuration }, context);
    runtime.emit();
    return { ok: true };
  }

  function requireRunning() {
    return state.status === "RUNNING"
      ? null
      : { ok: false, code: state.status === "FINISH" ? "MATCH_FINISHED" : "MATCH_NOT_RUNNING" };
  }

  return {
    loadLiveState,
    clearTimer,
    finishTimer,
    syncTimerFromClock,
    startTimer,
    stopTimer,
    resetTimer,
    resetScore,
    resetAll,
    requireRunning,
  };
}

module.exports = { createMatchService, TIMER_POLL_MS };
