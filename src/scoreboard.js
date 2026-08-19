"use strict";

const crypto = require("crypto");
const {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  formatTime,
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeam,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
} = require("./domain");
const { Persistence } = require("./persistence");

const MAX_RESULTS = 200;
const TIMER_POLL_MS = 100;

function createScoreboard({ dataDir, obsDir, onUpdate = () => {} }) {
  const persistence = new Persistence({ dataDir, obsDir });

  let scoreA = 0;
  let scoreB = 0;
  let shotA = "";
  let shotB = "";
  let missionShotsA = ["", "", "", ""];
  let missionShotsB = ["", "", "", ""];
  let teamNames = ["TEAM A", "TEAM B"];
  let teamWeights = {};
  let teamSchools = {};
  let teamNameA = "TEAM A";
  let teamNameB = "TEAM B";
  let teamNamesVisible = true;
  let matchResults = [];
  let currentMatchSaved = false;
  let currentMatchSavedResultId = "";
  let timeElapsed = 0;
  let matchDuration = 180;
  let status = "STOP";
  let timerHandle = null;
  let timerStartedAtNs = null;
  let timerBaseElapsedMs = 0;

  function getTeamWeight(name) {
    const cleanName = cleanTeamName(name);
    return cleanName ? normalizeTeamWeight(teamWeights[cleanName]) : null;
  }

  function getTeamSchool(name) {
    const cleanName = cleanTeamName(name);
    return cleanName ? cleanSchoolName(teamSchools[cleanName]) : "";
  }

  function setTeamWeight(name, weight) {
    const cleanName = cleanTeamName(name);
    const safeWeight = normalizeTeamWeight(weight);
    if (!cleanName) return;
    if (safeWeight === null) delete teamWeights[cleanName];
    else teamWeights[cleanName] = safeWeight;
  }

  function setTeamSchool(name, school) {
    const cleanName = cleanTeamName(name);
    const safeSchool = cleanSchoolName(school);
    if (!cleanName) return;
    if (!safeSchool) delete teamSchools[cleanName];
    else teamSchools[cleanName] = safeSchool;
  }

  function findTeamNameIndex(name) {
    const cleanName = cleanTeamName(name).toLocaleLowerCase();
    return teamNames.findIndex((item) => item.toLocaleLowerCase() === cleanName);
  }

  function addTeamNameToList(name) {
    const cleanName = cleanTeamName(name);
    if (!cleanName) return "";
    const existing = findTeamNameIndex(cleanName);
    if (existing >= 0) return teamNames[existing];
    teamNames.push(cleanName);
    return cleanName;
  }

  function normalizeTeamList(names) {
    teamNames = [];
    if (Array.isArray(names)) names.forEach(addTeamNameToList);
    if (teamNames.length === 0) teamNames = ["TEAM A", "TEAM B"];
  }

  function normalizeMatchResult(result) {
    const safe = result && typeof result === "object" ? result : {};
    const winnerInfo = getWinnerInfoFromValues(
      safe.scoreA,
      safe.scoreB,
      safe.shotA,
      safe.shotB,
      safe.teamWeightA,
      safe.teamWeightB,
      safe.teamNameA,
      safe.teamNameB
    );
    return { ...safe, winner: winnerInfo.winner, winnerName: winnerInfo.winnerName };
  }

  async function loadTeamData() {
    const saved = await persistence.firstExistingJson("team-names.json", "team-names.json", null);
    if (saved && typeof saved === "object") {
      normalizeTeamList(saved.teamNames);
      teamWeights = {};
      teamSchools = {};
      teamNames.forEach((name) => setTeamWeight(name, saved.teamWeights && saved.teamWeights[name]));
      teamNames.forEach((name) => setTeamSchool(name, saved.teamSchools && saved.teamSchools[name]));
      teamNameA = cleanTeamName(saved.teamNameA) || teamNames[0] || "TEAM A";
      teamNameB = cleanTeamName(saved.teamNameB) || teamNames[1] || teamNames[0] || "TEAM B";
      teamNamesVisible = typeof saved.teamNamesVisible === "boolean" ? saved.teamNamesVisible : true;
      teamNameA = addTeamNameToList(teamNameA);
      teamNameB = addTeamNameToList(teamNameB);
      return;
    }

    const savedNameA = cleanTeamName(await persistence.readLegacyText("team-name-a.text"));
    const savedNameB = cleanTeamName(await persistence.readLegacyText("team-name-b.text"));
    teamNameA = addTeamNameToList(savedNameA || "TEAM A");
    teamNameB = addTeamNameToList(savedNameB || "TEAM B");
  }

  async function loadResults() {
    const saved = await persistence.firstExistingJson("match-results.json", "match-results.json", []);
    matchResults = Array.isArray(saved) ? saved.map(normalizeMatchResult).slice(0, MAX_RESULTS) : [];
  }

  async function loadLiveState() {
    const saved = await persistence.firstExistingJson("live-match-state.json", "live-match-state.json", null);
    if (!saved || typeof saved !== "object") return;

    const a = Number(saved.scoreA);
    const b = Number(saved.scoreB);
    scoreA = Number.isFinite(a) ? Math.max(Math.floor(a), 0) : 0;
    scoreB = Number.isFinite(b) ? Math.max(Math.floor(b), 0) : 0;
    matchDuration = normalizeMatchDuration(saved.matchDuration, 180);

    const elapsed = Number(saved.timeElapsed);
    timeElapsed = Number.isFinite(elapsed)
      ? Math.min(Math.max(Math.floor(elapsed), 0), matchDuration)
      : 0;

    shotA = String(saved.shotA || "");
    shotB = String(saved.shotB || "");
    const recordedA = Array.isArray(saved.recordedMissionShotsA);
    const recordedB = Array.isArray(saved.recordedMissionShotsB);
    missionShotsA = normalizeMissionShots(recordedA ? saved.recordedMissionShotsA : saved.missionShotsA);
    missionShotsB = normalizeMissionShots(recordedB ? saved.recordedMissionShotsB : saved.missionShotsB);
    teamNameA = addTeamNameToList(saved.teamNameA || teamNameA) || teamNameA;
    teamNameB = addTeamNameToList(saved.teamNameB || teamNameB) || teamNameB;

    const savedStatus = String(saved.status || "STOP").toUpperCase();
    status = new Set(["STOP", "RUNNING", "FINISH"]).has(savedStatus) ? savedStatus : "STOP";

    const finishTime = formatTime(matchDuration);
    if (!recordedA && status === "FINISH" && shotA === finishTime && missionShotsA[3] === finishTime) {
      missionShotsA[3] = "";
    }
    if (!recordedB && status === "FINISH" && shotB === finishTime && missionShotsB[3] === finishTime) {
      missionShotsB[3] = "";
    }

    if (status === "RUNNING") status = "STOP";

    const resultId = String(saved.currentMatchSavedResultId || "");
    currentMatchSaved = Boolean(
      saved.currentMatchSaved &&
      resultId &&
      matchResults.some((result) => result && result.id === resultId)
    );
    currentMatchSavedResultId = currentMatchSaved ? resultId : "";
  }

  function saveTeamData() {
    persistence.queueJson("team-names.json", {
      teamNames,
      teamWeights,
      teamSchools,
      teamNameA,
      teamNameB,
      teamNamesVisible,
    });
  }

  function saveResults() {
    persistence.queueJson("match-results.json", matchResults);
  }

  function winnerInfo() {
    return getWinnerInfoFromValues(
      scoreA,
      scoreB,
      shotA,
      shotB,
      getTeamWeight(teamNameA),
      getTeamWeight(teamNameB),
      teamNameA,
      teamNameB
    );
  }

  function currentResultFields() {
    const winner = winnerInfo();
    return {
      teamNameA,
      teamNameB,
      teamWeightA: getTeamWeight(teamNameA),
      teamWeightB: getTeamWeight(teamNameB),
      teamSchoolA: getTeamSchool(teamNameA),
      teamSchoolB: getTeamSchool(teamNameB),
      scoreA,
      scoreB,
      shotA,
      shotB,
      missionShotsA: normalizeMissionShots(missionShotsA),
      missionShotsB: normalizeMissionShots(missionShotsB),
      elapsedSeconds: timeElapsed,
      elapsedTime: formatTime(timeElapsed),
      matchDuration,
      winner: winner.winner,
      winnerName: winner.winnerName,
    };
  }

  function resetCurrentMatchSave() {
    currentMatchSaved = false;
    currentMatchSavedResultId = "";
  }

  function nextMatchNumber() {
    return matchResults.reduce((highest, result) => {
      const n = Number(result && result.matchNumber);
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0) + 1;
  }

  function saveCurrentMatchResult(mode) {
    if (currentMatchSaved) return false;
    const result = {
      id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      matchNumber: nextMatchNumber(),
      savedAt: new Date().toISOString(),
      mode: mode === "auto" ? "auto" : "manual",
      ...currentResultFields(),
    };
    matchResults = [result, ...matchResults].slice(0, MAX_RESULTS);
    currentMatchSaved = true;
    currentMatchSavedResultId = result.id;
    saveResults();
    return true;
  }

  function updateCurrentMatchResult() {
    if (!currentMatchSaved || !currentMatchSavedResultId) return false;
    const index = matchResults.findIndex((item) => item && item.id === currentMatchSavedResultId);
    if (index < 0) return false;
    matchResults[index] = { ...matchResults[index], ...currentResultFields() };
    saveResults();
    return true;
  }

  function livePersistenceData() {
    return {
      scoreA,
      scoreB,
      shotA,
      shotB,
      missionShotsA: normalizeMissionShots(missionShotsA),
      missionShotsB: normalizeMissionShots(missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(missionShotsA),
      recordedMissionShotsB: normalizeMissionShots(missionShotsB),
      teamNameA,
      teamNameB,
      teamSchoolA: getTeamSchool(teamNameA),
      teamSchoolB: getTeamSchool(teamNameB),
      timeElapsed,
      matchDuration,
      status,
      currentMatchSaved,
      currentMatchSavedResultId,
      savedAt: new Date().toISOString(),
    };
  }

  function updateData() {
    return {
      scoreA,
      scoreB,
      shotA,
      shotB,
      missionShotsA: normalizeMissionShots(missionShotsA),
      missionShotsB: normalizeMissionShots(missionShotsB),
      recordedMissionShotsA: normalizeMissionShots(missionShotsA),
      recordedMissionShotsB: normalizeMissionShots(missionShotsB),
      teamNames,
      teamWeights,
      teamSchools,
      teamNameA,
      teamNameB,
      teamWeightA: getTeamWeight(teamNameA),
      teamWeightB: getTeamWeight(teamNameB),
      teamSchoolA: getTeamSchool(teamNameA),
      teamSchoolB: getTeamSchool(teamNameB),
      teamNamesVisible,
      matchResults,
      currentMatchSaved,
      currentMatchSavedResultId,
      time: formatTime(timeElapsed),
      timeElapsed,
      matchDuration,
      remainingSeconds: Math.max(matchDuration - timeElapsed, 0),
      status,
    };
  }

  function obsValues() {
    const values = {
      "score_a.txt": scoreA,
      "score_b.txt": scoreB,
      "time.txt": formatTime(timeElapsed),
      "shot_a.txt": shotA,
      "shot_b.txt": shotB,
      "status.txt": status,
      "team-name-a.text": teamNamesVisible ? teamNameA : "",
      "team-name-b.text": teamNamesVisible ? teamNameB : "",
      "nameschool-a.text": teamNamesVisible ? getTeamSchool(teamNameA) : "",
      "nameschool-b.text": teamNamesVisible ? getTeamSchool(teamNameB) : "",
    };
    normalizeMissionShots(missionShotsA).forEach((value, index) => {
      values[`mission_shot_a_${index + 1}.txt`] = value;
    });
    normalizeMissionShots(missionShotsB).forEach((value, index) => {
      values[`mission_shot_b_${index + 1}.txt`] = value;
    });
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

  function clearTimer() {
    if (timerHandle !== null) clearInterval(timerHandle);
    timerHandle = null;
    timerStartedAtNs = null;
  }

  function finishTimer() {
    clearTimer();
    timeElapsed = matchDuration;
    status = "FINISH";
    const finishTime = formatTime(matchDuration);
    if (!shotA) shotA = finishTime;
    if (!shotB) shotB = finishTime;
    saveCurrentMatchResult("auto");
  }

  function syncTimerFromClock() {
    if (status !== "RUNNING" || timerStartedAtNs === null) return false;
    const next = elapsedSecondsFromClock(
      timerBaseElapsedMs,
      timerStartedAtNs,
      process.hrtime.bigint(),
      matchDuration
    );
    const changed = next !== timeElapsed;
    timeElapsed = next;
    if (timeElapsed >= matchDuration) {
      finishTimer();
      return true;
    }
    return changed;
  }

  function startTimer() {
    if (timerHandle !== null || status === "FINISH") return false;
    if (timeElapsed >= matchDuration) timeElapsed = 0;
    status = "RUNNING";
    timerBaseElapsedMs = timeElapsed * 1000;
    timerStartedAtNs = process.hrtime.bigint();
    timerHandle = setInterval(() => {
      if (syncTimerFromClock()) emit();
    }, TIMER_POLL_MS);
    emit();
    return true;
  }

  function stopTimer() {
    if (status === "FINISH") return false;
    syncTimerFromClock();
    clearTimer();
    status = "STOP";
    emit();
    return true;
  }

  function resetTimer(seconds = 180) {
    clearTimer();
    matchDuration = normalizeMatchDuration(seconds, 180);
    timeElapsed = 0;
    shotA = "";
    shotB = "";
    missionShotsA = ["", "", "", ""];
    missionShotsB = ["", "", "", ""];
    status = "STOP";
    resetCurrentMatchSave();
    emit();
    return matchDuration;
  }

  function addScore(team, point, allowAfterFinish = false) {
    const safeTeam = normalizeTeam(team);
    const safePoint = normalizeScoreDelta(point);
    if (!safeTeam || safePoint === null) return { ok: false, code: "INVALID_COMMAND" };
    syncTimerFromClock();
    if (status === "FINISH" && !allowAfterFinish) return { ok: false, code: "MATCH_FINISHED" };
    if (safeTeam === "A") scoreA = Math.max(scoreA + safePoint, 0);
    else scoreB = Math.max(scoreB + safePoint, 0);
    emit();
    return { ok: true, point: safePoint };
  }

  function missionShotList(team) {
    if (team === "A") return missionShotsA;
    if (team === "B") return missionShotsB;
    return null;
  }

  function hasMissionShot(team, mission) {
    const shots = missionShotList(team);
    const index = Number(mission) - 1;
    return Boolean(shots && index >= 0 && index < 4 && shots[index] !== "");
  }

  function recordMissionShot(team, mission, allowAfterFinish = false) {
    syncTimerFromClock();
    const safeTeam = normalizeTeam(team);
    const index = Number(mission) - 1;
    const shots = missionShotList(safeTeam);
    const canAfterFinish = allowAfterFinish && index === 3;
    if (!shots || index < 0 || index >= 4) return false;
    if (status === "FINISH" && !canAfterFinish) return false;
    if (shots[index] !== "") return false;

    const shotTime = formatTime(timeElapsed);
    shots[index] = shotTime;
    if (index === 3) {
      if (safeTeam === "A" && !shotA) shotA = shotTime;
      if (safeTeam === "B" && !shotB) shotB = shotTime;
    }
    return true;
  }

  function missionScore(team, mission) {
    const safeTeam = normalizeTeam(team);
    const point = getMissionPoint(mission);
    if (!safeTeam || point === null) return { ok: false, code: "INVALID_COMMAND" };
    syncTimerFromClock();
    if (status === "FINISH") return { ok: false, code: "MATCH_FINISHED" };
    if (hasMissionShot(safeTeam, mission)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };

    if (safeTeam === "A") scoreA += point;
    else scoreB += point;
    recordMissionShot(safeTeam, mission);
    emit();
    return { ok: true, point };
  }

  function missionShot(team, mission) {
    if (!normalizeTeam(team) || getMissionPoint(mission) === null) {
      return { ok: false, code: "INVALID_COMMAND" };
    }
    if (!recordMissionShot(team, mission)) return { ok: false, code: "MISSION_NOT_RECORDABLE" };
    emit();
    return { ok: true };
  }

  function endWithBonus(team) {
    const safeTeam = normalizeTeam(team);
    const point = getMissionPoint(4);
    if (!safeTeam) return { ok: false, code: "INVALID_COMMAND" };
    if (hasMissionShot(safeTeam, 4)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };
    if (!recordMissionShot(safeTeam, 4, true)) return { ok: false, code: "MISSION_NOT_RECORDABLE" };

    if (safeTeam === "A") scoreA += point;
    else scoreB += point;
    if (status === "FINISH") updateCurrentMatchResult();
    emit();
    return { ok: true, point };
  }

  function resetScore() {
    if (status === "RUNNING") return { ok: false, code: "MATCH_RUNNING" };
    scoreA = 0;
    scoreB = 0;
    shotA = "";
    shotB = "";
    missionShotsA = ["", "", "", ""];
    missionShotsB = ["", "", "", ""];
    timeElapsed = 0;
    status = "STOP";
    resetCurrentMatchSave();
    emit();
    return { ok: true };
  }

  function resetAll() {
    scoreA = 0;
    scoreB = 0;
    resetTimer(180);
    return { ok: true };
  }

  function addTeam(data) {
    const name = addTeamNameToList(data && data.name);
    if (!name) return { ok: false, code: "INVALID_TEAM_NAME" };
    const weight = normalizeTeamWeight(data && data.weight);
    if (weight !== null) setTeamWeight(name, weight);
    const school = cleanSchoolName(data && data.school);
    if (school) setTeamSchool(name, school);
    saveTeamData();
    emit();
    return { ok: true };
  }

  function editTeam(data) {
    const oldName = cleanTeamName(data && data.oldName);
    const newName = cleanTeamName(data && data.newName);
    const index = findTeamNameIndex(oldName);
    if (index < 0 || !newName) return { ok: false };

    const duplicate = findTeamNameIndex(newName);
    if (duplicate >= 0 && duplicate !== index) {
      if (data.weight !== undefined) setTeamWeight(teamNames[duplicate], data.weight);
      if (data.school !== undefined) setTeamSchool(teamNames[duplicate], data.school);
      if (teamNameA === teamNames[index]) teamNameA = teamNames[duplicate];
      if (teamNameB === teamNames[index]) teamNameB = teamNames[duplicate];
      delete teamWeights[teamNames[index]];
      delete teamSchools[teamNames[index]];
      teamNames.splice(index, 1);
    } else {
      const previous = teamNames[index];
      const previousWeight = getTeamWeight(previous);
      const previousSchool = getTeamSchool(previous);
      teamNames[index] = newName;
      delete teamWeights[previous];
      delete teamSchools[previous];
      setTeamWeight(newName, data.weight === undefined ? previousWeight : data.weight);
      setTeamSchool(newName, data.school === undefined ? previousSchool : data.school);
      if (teamNameA === previous) teamNameA = newName;
      if (teamNameB === previous) teamNameB = newName;
    }

    saveTeamData();
    emit();
    return { ok: true };
  }

  function selectTeam(data) {
    const team = normalizeTeam(data && data.team);
    const selected = addTeamNameToList(data && data.name);
    if (!team || !selected) return { ok: false };
    if (team === "A") teamNameA = selected;
    else teamNameB = selected;
    saveTeamData();
    emit();
    return { ok: true };
  }

  function deleteTeam(data) {
    const name = cleanTeamName(data && data.name);
    const index = findTeamNameIndex(name);
    if (index < 0 || teamNames.length <= 1) return { ok: false };
    const deleted = teamNames[index];
    teamNames.splice(index, 1);
    delete teamWeights[deleted];
    delete teamSchools[deleted];
    if (teamNameA === deleted) teamNameA = teamNames.find((item) => item !== teamNameB) || teamNames[0] || "TEAM A";
    if (teamNameB === deleted) teamNameB = teamNames.find((item) => item !== teamNameA) || teamNames[0] || "TEAM B";
    saveTeamData();
    emit();
    return { ok: true };
  }

  function setNamesVisible(visible) {
    teamNamesVisible = Boolean(visible);
    saveTeamData();
    emit();
    return { ok: true };
  }

  function deleteResult(data) {
    const id = String(data && data.id || "").trim();
    if (!id) return { ok: false, deleted: false, matchResults };
    const before = matchResults.length;
    matchResults = matchResults.filter((item) => item && item.id !== id);
    const deleted = before !== matchResults.length;
    if (deleted) {
      if (currentMatchSavedResultId === id) resetCurrentMatchSave();
      saveResults();
      emit();
    }
    return { ok: deleted, deleted, matchResults };
  }

  async function initialize() {
    await persistence.ensureDirectories();
    await loadTeamData();
    await loadResults();
    await loadLiveState();
    saveTeamData();
    saveResults();
    persist(true);
    await persistence.flushAll();
  }

  async function shutdown() {
    if (status === "RUNNING") syncTimerFromClock();
    clearTimer();
    persist(false);
    await persistence.flushAll();
  }

  return {
    initialize,
    shutdown,
    getUpdateData: updateData,
    forcePersist: () => persist(true),
    addScore,
    missionScore,
    missionShot,
    endWithBonus,
    resetTimer,
    startTimer,
    stopTimer,
    resetScore,
    resetAll,
    addTeam,
    editTeam,
    selectTeam,
    deleteTeam,
    setNamesVisible,
    deleteResult,
  };
}

module.exports = { createScoreboard };
