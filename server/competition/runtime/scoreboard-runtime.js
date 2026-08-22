"use strict";

const {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  formatTime,
} = require("../domain");
const { projectBroadcastState } = require("../../broadcast/broadcast-projector");

function createScoreboardRuntime({ state, rules, persistence, broadcastOutput, eventLog, onUpdate }) {
  function contextFields(context) {
    const safe = context && typeof context === "object" ? context : {};
    return {
      socketId: String(safe.socketId || "").slice(0, 100) || undefined,
      ip: String(safe.ip || "").slice(0, 100) || undefined,
      page: String(safe.page || "").slice(0, 100) || undefined,
    };
  }

  function log(action, details = {}, context = {}) {
    const entry = {
      at: new Date().toISOString(), action, status: state.status, elapsedSeconds: state.timeElapsed,
      teamNameA: state.teamNameA, teamNameB: state.teamNameB, scoreA: state.scoreA, scoreB: state.scoreB,
      ...contextFields(context), details,
    };
    void eventLog.append(entry);
    return entry;
  }

  function getTeamWeight(name) {
    const cleanName = cleanTeamName(name);
    return cleanName ? normalizeTeamWeight(state.teamWeights[cleanName]) : null;
  }

  function getTeamSchool(name) {
    const cleanName = cleanTeamName(name);
    return cleanName ? cleanSchoolName(state.teamSchools[cleanName]) : "";
  }

  function setTeamWeight(name, weight) {
    const cleanName = cleanTeamName(name);
    const safeWeight = normalizeTeamWeight(weight);
    if (!cleanName) return;
    if (safeWeight === null) delete state.teamWeights[cleanName];
    else state.teamWeights[cleanName] = safeWeight;
  }

  function setTeamSchool(name, school) {
    const cleanName = cleanTeamName(name);
    const safeSchool = cleanSchoolName(school);
    if (!cleanName) return;
    if (!safeSchool) delete state.teamSchools[cleanName];
    else state.teamSchools[cleanName] = safeSchool;
  }

  function findTeamNameIndex(name) {
    const clean = cleanTeamName(name).toLocaleLowerCase();
    return state.teamNames.findIndex((item) => item.toLocaleLowerCase() === clean);
  }

  function addTeamNameToList(name) {
    const clean = cleanTeamName(name);
    if (!clean) return "";
    const existing = findTeamNameIndex(clean);
    if (existing >= 0) return state.teamNames[existing];
    state.teamNames.push(clean);
    return clean;
  }

  function normalizeTeamList(names) {
    state.teamNames = [];
    if (Array.isArray(names)) names.forEach(addTeamNameToList);
    if (state.teamNames.length === 0) state.teamNames = ["TEAM A", "TEAM B"];
    if (state.teamNames.length === 1) addTeamNameToList(state.teamNames[0] === "TEAM A" ? "TEAM B" : "TEAM A");
  }

  function ensureDistinctSelectedTeams() {
    if (state.teamNameA !== state.teamNameB) return;
    const replacement = state.teamNames.find((name) => name !== state.teamNameA);
    if (replacement) state.teamNameB = replacement;
    else state.teamNameB = addTeamNameToList(state.teamNameA === "TEAM A" ? "TEAM B" : "TEAM A");
  }

  function saveTeamData() {
    persistence.queueJson("team-names.json", {
      teamNames: state.teamNames, teamWeights: state.teamWeights, teamSchools: state.teamSchools,
      teamNameA: state.teamNameA, teamNameB: state.teamNameB, teamNamesVisible: state.teamNamesVisible,
    });
  }

  function saveResults() { persistence.queueJson("match-results.json", state.matchResults); }

  function livePersistenceData() {
    return {
      scoreA: state.scoreA, scoreB: state.scoreB, shotA: state.shotA, shotB: state.shotB,
      missionShotsA: normalizeMissionShots(state.missionShotsA), missionShotsB: normalizeMissionShots(state.missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(state.missionShotsA), recordedMissionShotsB: normalizeMissionShots(state.missionShotsB),
      teamNameA: state.teamNameA, teamNameB: state.teamNameB, timeElapsed: state.timeElapsed,
      matchDuration: state.matchDuration, status: state.status, currentMatchSaved: state.currentMatchSaved,
      currentMatchSavedResultId: state.currentMatchSavedResultId, resultLocked: state.resultLocked,
      savedAt: new Date().toISOString(),
    };
  }

  function updateData() {
    return {
      scoreA: state.scoreA, scoreB: state.scoreB, shotA: state.shotA, shotB: state.shotB,
      missionShotsA: normalizeMissionShots(state.missionShotsA), missionShotsB: normalizeMissionShots(state.missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(state.missionShotsA), recordedMissionShotsB: normalizeMissionShots(state.missionShotsB),
      teamNames: state.teamNames, teamWeights: state.teamWeights, teamSchools: state.teamSchools,
      teamNameA: state.teamNameA, teamNameB: state.teamNameB,
      teamWeightA: getTeamWeight(state.teamNameA), teamWeightB: getTeamWeight(state.teamNameB),
      teamSchoolA: getTeamSchool(state.teamNameA), teamSchoolB: getTeamSchool(state.teamNameB),
      teamNamesVisible: state.teamNamesVisible, matchResults: state.matchResults,
      currentMatchSaved: state.currentMatchSaved, currentMatchSavedResultId: state.currentMatchSavedResultId,
      resultLocked: state.resultLocked, resultReviewRequired: state.status === "FINISH" && state.currentMatchSaved && !state.resultLocked,
      time: formatTime(state.timeElapsed), timeElapsed: state.timeElapsed, matchDuration: state.matchDuration,
      remainingSeconds: Math.max(state.matchDuration - state.timeElapsed, 0), finalWarningSeconds: rules.finalWarningSeconds,
      status: state.status, rules: { scoreAdjustments: [...rules.scoreAdjustments], missions: { ...rules.missions } },
    };
  }

  function broadcastSnapshot(data = null) { return projectBroadcastState(data || updateData()); }

  function persist(forceBroadcast = false, data = null) {
    persistence.queueJson("live-match-state.json", livePersistenceData());
    broadcastOutput.publish(broadcastSnapshot(data), forceBroadcast);
  }

  function emit() {
    const data = updateData();
    const broadcast = broadcastSnapshot(data);
    onUpdate(data, broadcast);
    persist(false, data);
    return data;
  }

  return {
    log, getTeamWeight, getTeamSchool, setTeamWeight, setTeamSchool, findTeamNameIndex,
    addTeamNameToList, normalizeTeamList, ensureDistinctSelectedTeams, saveTeamData, saveResults,
    livePersistenceData, updateData, broadcastSnapshot, persist, emit,
  };
}

module.exports = { createScoreboardRuntime };
