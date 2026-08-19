"use strict";

const {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  formatTime,
} = require("../domain");

function createScoreboardRuntime({ state, rules, persistence, eventLog, onUpdate }) {
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
      at: new Date().toISOString(),
      action,
      status: state.status,
      elapsedSeconds: state.timeElapsed,
      teamNameA: state.teamNameA,
      teamNameB: state.teamNameB,
      scoreA: state.scoreA,
      scoreB: state.scoreB,
      ...contextFields(context),
      details,
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
      teamNames: state.teamNames,
      teamWeights: state.teamWeights,
      teamSchools: state.teamSchools,
      teamNameA: state.teamNameA,
      teamNameB: state.teamNameB,
      teamNamesVisible: state.teamNamesVisible,
    });
  }

  function saveResults() {
    persistence.queueJson("match-results.json", state.matchResults);
  }

  function livePersistenceData() {
    return {
      scoreA: state.scoreA,
      scoreB: state.scoreB,
      shotA: state.shotA,
      shotB: state.shotB,
      missionShotsA: normalizeMissionShots(state.missionShotsA),
      missionShotsB: normalizeMissionShots(state.missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(state.missionShotsA),
      recordedMissionShotsB: normalizeMissionShots(state.missionShotsB),
      teamNameA: state.teamNameA,
      teamNameB: state.teamNameB,
      timeElapsed: state.timeElapsed,
      matchDuration: state.matchDuration,
      status: state.status,
      currentMatchSaved: state.currentMatchSaved,
      currentMatchSavedResultId: state.currentMatchSavedResultId,
      resultLocked: state.resultLocked,
      savedAt: new Date().toISOString(),
    };
  }

  function updateData() {
    return {
      scoreA: state.scoreA,
      scoreB: state.scoreB,
      shotA: state.shotA,
      shotB: state.shotB,
      missionShotsA: normalizeMissionShots(state.missionShotsA),
      missionShotsB: normalizeMissionShots(state.missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(state.missionShotsA),
      recordedMissionShotsB: normalizeMissionShots(state.missionShotsB),
      teamNames: state.teamNames,
      teamWeights: state.teamWeights,
      teamSchools: state.teamSchools,
      teamNameA: state.teamNameA,
      teamNameB: state.teamNameB,
      teamWeightA: getTeamWeight(state.teamNameA),
      teamWeightB: getTeamWeight(state.teamNameB),
      teamSchoolA: getTeamSchool(state.teamNameA),
      teamSchoolB: getTeamSchool(state.teamNameB),
      teamNamesVisible: state.teamNamesVisible,
      matchResults: state.matchResults,
      currentMatchSaved: state.currentMatchSaved,
      currentMatchSavedResultId: state.currentMatchSavedResultId,
      resultLocked: state.resultLocked,
      resultReviewRequired: state.status === "FINISH" && state.currentMatchSaved && !state.resultLocked,
      time: formatTime(state.timeElapsed),
      timeElapsed: state.timeElapsed,
      matchDuration: state.matchDuration,
      remainingSeconds: Math.max(state.matchDuration - state.timeElapsed, 0),
      finalWarningSeconds: rules.finalWarningSeconds,
      status: state.status,
      rules: {
        scoreAdjustments: [...rules.scoreAdjustments],
        missions: { ...rules.missions },
      },
    };
  }

  function obsValues() {
    const values = {
      "score_a.txt": state.scoreA,
      "score_b.txt": state.scoreB,
      "time.txt": formatTime(state.timeElapsed),
      "shot_a.txt": state.shotA,
      "shot_b.txt": state.shotB,
      "status.txt": state.status,
      "team-name-a.text": state.teamNamesVisible ? state.teamNameA : "",
      "team-name-b.text": state.teamNamesVisible ? state.teamNameB : "",
      "nameschool-a.text": state.teamNamesVisible ? getTeamSchool(state.teamNameA) : "",
      "nameschool-b.text": state.teamNamesVisible ? getTeamSchool(state.teamNameB) : "",
    };
    normalizeMissionShots(state.missionShotsA).forEach((value, i) => { values[`mission_shot_a_${i + 1}.txt`] = value; });
    normalizeMissionShots(state.missionShotsB).forEach((value, i) => { values[`mission_shot_b_${i + 1}.txt`] = value; });
    return values;
  }

  function persist(forceObs = false) {
    persistence.queueJson("live-match-state.json", livePersistenceData());
    persistence.queueObs(obsValues(), forceObs);
  }

  function emit() {
    const data = updateData();
    onUpdate(data);
    persist(false);
    return data;
  }

  return {
    log,
    getTeamWeight,
    getTeamSchool,
    setTeamWeight,
    setTeamSchool,
    findTeamNameIndex,
    addTeamNameToList,
    normalizeTeamList,
    ensureDistinctSelectedTeams,
    saveTeamData,
    saveResults,
    livePersistenceData,
    updateData,
    obsValues,
    persist,
    emit,
  };
}

module.exports = { createScoreboardRuntime };
