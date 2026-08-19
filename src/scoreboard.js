"use strict";

const crypto = require("node:crypto");
const {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeMissionShots,
  normalizeCorrectionTime,
  formatTime,
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeam,
  normalizeMatchDuration,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
} = require("./domain");
const { normalizeRules } = require("./rules");
const { Persistence } = require("./persistence");
const { EventLog } = require("./event-log");

const MAX_RESULTS = 200;
const TIMER_POLL_MS = 100;
const STATUSES = new Set(["READY", "RUNNING", "PAUSED", "FINISH"]);

function createScoreboard({ dataDir, obsDir, onUpdate = () => {}, rules: suppliedRules = {} }) {
  const rules = normalizeRules(suppliedRules);
  const persistence = new Persistence({ dataDir, obsDir });
  const eventLog = new EventLog(dataDir);

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
  let resultLocked = false;
  let timeElapsed = 0;
  let matchDuration = rules.matchDurationSeconds;
  let status = "READY";
  let timerHandle = null;
  let timerStartedAtNs = null;
  let timerBaseElapsedMs = 0;

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
      status,
      elapsedSeconds: timeElapsed,
      teamNameA,
      teamNameB,
      scoreA,
      scoreB,
      ...contextFields(context),
      details,
    };
    void eventLog.append(entry);
    return entry;
  }

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
    const clean = cleanTeamName(name).toLocaleLowerCase();
    return teamNames.findIndex((item) => item.toLocaleLowerCase() === clean);
  }

  function addTeamNameToList(name) {
    const clean = cleanTeamName(name);
    if (!clean) return "";
    const existing = findTeamNameIndex(clean);
    if (existing >= 0) return teamNames[existing];
    teamNames.push(clean);
    return clean;
  }

  function normalizeTeamList(names) {
    teamNames = [];
    if (Array.isArray(names)) names.forEach(addTeamNameToList);
    if (teamNames.length === 0) teamNames = ["TEAM A", "TEAM B"];
    if (teamNames.length === 1) addTeamNameToList(teamNames[0] === "TEAM A" ? "TEAM B" : "TEAM A");
  }

  function ensureDistinctSelectedTeams() {
    if (teamNameA !== teamNameB) return;
    const replacement = teamNames.find((name) => name !== teamNameA);
    if (replacement) teamNameB = replacement;
    else teamNameB = addTeamNameToList(teamNameA === "TEAM A" ? "TEAM B" : "TEAM A");
  }

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

  async function loadTeamData() {
    const saved = await persistence.firstExistingJson("team-names.json", "team-names.json", null);
    if (saved && typeof saved === "object") {
      normalizeTeamList(saved.teamNames);
      teamWeights = {};
      teamSchools = {};
      teamNames.forEach((name) => setTeamWeight(name, saved.teamWeights && saved.teamWeights[name]));
      teamNames.forEach((name) => setTeamSchool(name, saved.teamSchools && saved.teamSchools[name]));
      teamNameA = cleanTeamName(saved.teamNameA) || teamNames[0] || "TEAM A";
      teamNameB = cleanTeamName(saved.teamNameB) || teamNames[1] || "TEAM B";
      teamNamesVisible = typeof saved.teamNamesVisible === "boolean" ? saved.teamNamesVisible : true;
      teamNameA = addTeamNameToList(teamNameA);
      teamNameB = addTeamNameToList(teamNameB);
      ensureDistinctSelectedTeams();
      return;
    }
    const savedNameA = cleanTeamName(await persistence.readLegacyText("team-name-a.text"));
    const savedNameB = cleanTeamName(await persistence.readLegacyText("team-name-b.text"));
    teamNameA = addTeamNameToList(savedNameA || "TEAM A");
    teamNameB = addTeamNameToList(savedNameB || "TEAM B");
    ensureDistinctSelectedTeams();
  }

  async function loadResults() {
    const saved = await persistence.firstExistingJson("match-results.json", "match-results.json", []);
    matchResults = Array.isArray(saved) ? saved.map(normalizeMatchResult).slice(0, MAX_RESULTS) : [];
  }

  async function loadLiveState() {
    const saved = await persistence.firstExistingJson("live-match-state.json", "live-match-state.json", null);
    if (!saved || typeof saved !== "object") return { recovered: false, fromStatus: null };

    const a = Number(saved.scoreA);
    const b = Number(saved.scoreB);
    scoreA = Number.isFinite(a) ? Math.max(Math.floor(a), 0) : 0;
    scoreB = Number.isFinite(b) ? Math.max(Math.floor(b), 0) : 0;
    matchDuration = normalizeMatchDuration(saved.matchDuration, rules.matchDurationSeconds);

    const elapsed = Number(saved.timeElapsed);
    timeElapsed = Number.isFinite(elapsed) ? Math.min(Math.max(Math.floor(elapsed), 0), matchDuration) : 0;
    shotA = String(saved.shotA || "");
    shotB = String(saved.shotB || "");
    missionShotsA = normalizeMissionShots(saved.recordedMissionShotsA || saved.missionShotsA);
    missionShotsB = normalizeMissionShots(saved.recordedMissionShotsB || saved.missionShotsB);
    teamNameA = addTeamNameToList(saved.teamNameA || teamNameA) || teamNameA;
    teamNameB = addTeamNameToList(saved.teamNameB || teamNameB) || teamNameB;
    ensureDistinctSelectedTeams();

    const fromStatus = String(saved.status || "READY").toUpperCase();
    if (fromStatus === "RUNNING") status = "PAUSED";
    else if (fromStatus === "STOP") status = timeElapsed > 0 ? "PAUSED" : "READY";
    else status = STATUSES.has(fromStatus) ? fromStatus : "READY";

    const resultId = String(saved.currentMatchSavedResultId || "");
    currentMatchSaved = Boolean(saved.currentMatchSaved && resultId && matchResults.some((r) => r && r.id === resultId));
    currentMatchSavedResultId = currentMatchSaved ? resultId : "";
    const current = matchResults.find((r) => r && r.id === currentMatchSavedResultId);
    resultLocked = currentMatchSaved ? Boolean(saved.resultLocked || (current && current.locked)) : false;

    return { recovered: true, fromStatus };
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
    resultLocked = false;
  }

  function nextMatchNumber() {
    return matchResults.reduce((highest, result) => {
      const n = Number(result && result.matchNumber);
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0) + 1;
  }

  function saveCurrentMatchResult(mode, context = {}) {
    if (currentMatchSaved) return false;
    const result = {
      id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      matchNumber: nextMatchNumber(),
      savedAt: new Date().toISOString(),
      mode: mode === "auto" ? "auto" : "manual",
      locked: false,
      lockedAt: null,
      ...currentResultFields(),
    };
    matchResults = [result, ...matchResults].slice(0, MAX_RESULTS);
    currentMatchSaved = true;
    currentMatchSavedResultId = result.id;
    resultLocked = false;
    saveResults();
    log("RESULT_SAVED", { resultId: result.id, matchNumber: result.matchNumber, mode: result.mode }, context);
    return true;
  }

  function updateCurrentMatchResult() {
    if (!currentMatchSaved || !currentMatchSavedResultId) return false;
    const index = matchResults.findIndex((item) => item && item.id === currentMatchSavedResultId);
    if (index < 0) return false;
    matchResults[index] = { ...matchResults[index], ...currentResultFields(), locked: resultLocked };
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
      timeElapsed,
      matchDuration,
      status,
      currentMatchSaved,
      currentMatchSavedResultId,
      resultLocked,
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
      resultLocked,
      resultReviewRequired: status === "FINISH" && currentMatchSaved && !resultLocked,
      time: formatTime(timeElapsed),
      timeElapsed,
      matchDuration,
      remainingSeconds: Math.max(matchDuration - timeElapsed, 0),
      finalWarningSeconds: rules.finalWarningSeconds,
      status,
      rules: {
        scoreAdjustments: [...rules.scoreAdjustments],
        missions: { ...rules.missions },
      },
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
    normalizeMissionShots(missionShotsA).forEach((value, i) => { values[`mission_shot_a_${i + 1}.txt`] = value; });
    normalizeMissionShots(missionShotsB).forEach((value, i) => { values[`mission_shot_b_${i + 1}.txt`] = value; });
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

  function finishTimer(context = {}) {
    clearTimer();
    timeElapsed = matchDuration;
    status = "FINISH";
    const finishTime = formatTime(matchDuration);
    if (!shotA) shotA = finishTime;
    if (!shotB) shotB = finishTime;
    saveCurrentMatchResult("auto", context);
    log("MATCH_FINISH", { resultReviewRequired: true }, context);
  }

  function syncTimerFromClock(context = {}) {
    if (status !== "RUNNING" || timerStartedAtNs === null) return false;
    const next = elapsedSecondsFromClock(timerBaseElapsedMs, timerStartedAtNs, process.hrtime.bigint(), matchDuration);
    const changed = next !== timeElapsed;
    timeElapsed = next;
    if (timeElapsed >= matchDuration) {
      finishTimer(context);
      return true;
    }
    return changed;
  }

  function startTimer(context = {}) {
    if (timerHandle !== null || status === "RUNNING") return { ok: false, code: "MATCH_ALREADY_RUNNING" };
    if (status === "FINISH") return { ok: false, code: "MATCH_FINISHED" };
    if (status !== "READY" && status !== "PAUSED") return { ok: false, code: "INVALID_STATE" };
    status = "RUNNING";
    timerBaseElapsedMs = timeElapsed * 1000;
    timerStartedAtNs = process.hrtime.bigint();
    timerHandle = setInterval(() => {
      if (syncTimerFromClock()) emit();
    }, TIMER_POLL_MS);
    log(timeElapsed === 0 ? "MATCH_START" : "MATCH_RESUME", {}, context);
    emit();
    return { ok: true, status };
  }

  function stopTimer(context = {}) {
    if (status !== "RUNNING") return { ok: false, code: "MATCH_NOT_RUNNING" };
    syncTimerFromClock(context);
    clearTimer();
    if (status !== "FINISH") status = "PAUSED";
    log("MATCH_PAUSE", {}, context);
    emit();
    return { ok: true, status };
  }

  function canPrepareNextMatch() {
    if (status === "RUNNING" || status === "PAUSED") return { ok: false, code: "MATCH_ACTIVE" };
    if (status === "FINISH" && currentMatchSaved && !resultLocked) return { ok: false, code: "RESULT_NOT_LOCKED" };
    return { ok: true };
  }

  function resetMatchState(seconds) {
    clearTimer();
    matchDuration = normalizeMatchDuration(seconds, rules.matchDurationSeconds);
    timeElapsed = 0;
    scoreA = 0;
    scoreB = 0;
    shotA = "";
    shotB = "";
    missionShotsA = ["", "", "", ""];
    missionShotsB = ["", "", "", ""];
    status = "READY";
    resetCurrentMatchSave();
  }

  function resetTimer(seconds = rules.matchDurationSeconds, context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    resetMatchState(seconds);
    log("MATCH_PREPARE", { matchDuration }, context);
    emit();
    return { ok: true, matchDuration };
  }

  function resetScore(context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    const duration = matchDuration;
    resetMatchState(duration);
    log("MATCH_RESET", { matchDuration }, context);
    emit();
    return { ok: true };
  }

  function resetAll(context = {}) {
    const guard = canPrepareNextMatch();
    if (!guard.ok) return guard;
    resetMatchState(rules.matchDurationSeconds);
    log("MATCH_RESET_ALL", { matchDuration }, context);
    emit();
    return { ok: true };
  }

  function requireRunning() {
    return status === "RUNNING" ? null : { ok: false, code: status === "FINISH" ? "MATCH_FINISHED" : "MATCH_NOT_RUNNING" };
  }

  function addScore(team, point, context = {}) {
    const safeTeam = normalizeTeam(team);
    const safePoint = normalizeScoreDelta(point, rules.scoreAdjustments);
    if (!safeTeam || safePoint === null) return { ok: false, code: "INVALID_COMMAND" };
    syncTimerFromClock(context);
    const guard = requireRunning();
    if (guard) return guard;
    if (safeTeam === "A") scoreA = Math.max(scoreA + safePoint, 0);
    else scoreB = Math.max(scoreB + safePoint, 0);
    log("SCORE_ADJUST", { team: safeTeam, delta: safePoint }, context);
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

  function recordMissionShot(team, mission) {
    const safeTeam = normalizeTeam(team);
    const index = Number(mission) - 1;
    const shots = missionShotList(safeTeam);
    if (!shots || index < 0 || index >= 4 || shots[index] !== "") return false;
    const shotTime = formatTime(timeElapsed);
    shots[index] = shotTime;
    if (index === 3) {
      if (safeTeam === "A" && !shotA) shotA = shotTime;
      if (safeTeam === "B" && !shotB) shotB = shotTime;
    }
    return true;
  }

  function missionScore(team, mission, context = {}) {
    const safeTeam = normalizeTeam(team);
    const point = getMissionPoint(mission, rules.missions);
    if (!safeTeam || point === null) return { ok: false, code: "INVALID_COMMAND" };
    syncTimerFromClock(context);
    const guard = requireRunning();
    if (guard) return guard;
    if (hasMissionShot(safeTeam, mission)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };
    if (safeTeam === "A") scoreA += point;
    else scoreB += point;
    recordMissionShot(safeTeam, mission);
    log("MISSION_SCORE", { team: safeTeam, mission: Number(mission), point }, context);
    emit();
    return { ok: true, point };
  }

  function missionShot(team, mission, context = {}) {
    const safeTeam = normalizeTeam(team);
    if (!safeTeam || getMissionPoint(mission, rules.missions) === null) return { ok: false, code: "INVALID_COMMAND" };
    syncTimerFromClock(context);
    const guard = requireRunning();
    if (guard) return guard;
    if (!recordMissionShot(safeTeam, mission)) return { ok: false, code: "MISSION_ALREADY_RECORDED" };
    log("MISSION_SHOT", { team: safeTeam, mission: Number(mission) }, context);
    emit();
    return { ok: true };
  }

  function endWithBonus(team, context = {}) {
    return missionScore(team, 4, context);
  }

  function correctResult(data, context = {}) {
    if (status !== "FINISH" || !currentMatchSaved) return { ok: false, code: "RESULT_NOT_AVAILABLE" };
    if (resultLocked) return { ok: false, code: "RESULT_LOCKED" };
    const safe = data && typeof data === "object" ? data : {};
    const type = String(safe.type || "");
    const team = normalizeTeam(safe.team);
    if (!team) return { ok: false, code: "INVALID_TEAM" };

    if (type === "score") {
      const delta = normalizeScoreDelta(safe.delta, rules.scoreAdjustments);
      if (delta === null) return { ok: false, code: "INVALID_SCORE_DELTA" };
      if (team === "A") scoreA = Math.max(scoreA + delta, 0);
      else scoreB = Math.max(scoreB + delta, 0);
      log("RESULT_CORRECT_SCORE", { team, delta }, context);
    } else if (type === "shot") {
      const value = normalizeCorrectionTime(safe.value, matchDuration);
      if (value === null) return { ok: false, code: "INVALID_TIME" };
      if (team === "A") shotA = value;
      else shotB = value;
      log("RESULT_CORRECT_SHOT", { team, value }, context);
    } else if (type === "mission-shot") {
      const mission = Number(safe.mission);
      if (!Number.isInteger(mission) || mission < 1 || mission > 4) return { ok: false, code: "INVALID_MISSION" };
      const value = normalizeCorrectionTime(safe.value, matchDuration);
      if (value === null) return { ok: false, code: "INVALID_TIME" };
      const shots = missionShotList(team);
      shots[mission - 1] = value;
      if (mission === 4) {
        if (team === "A") shotA = value;
        else shotB = value;
      }
      log("RESULT_CORRECT_MISSION_SHOT", { team, mission, value }, context);
    } else {
      return { ok: false, code: "INVALID_CORRECTION" };
    }

    updateCurrentMatchResult();
    emit();
    return { ok: true, result: currentResultFields() };
  }

  function finalizeResult(context = {}) {
    if (status !== "FINISH" || !currentMatchSaved || !currentMatchSavedResultId) return { ok: false, code: "RESULT_NOT_AVAILABLE" };
    if (resultLocked) return { ok: true, alreadyLocked: true };
    resultLocked = true;
    const index = matchResults.findIndex((item) => item && item.id === currentMatchSavedResultId);
    if (index >= 0) {
      matchResults[index] = {
        ...matchResults[index],
        ...currentResultFields(),
        locked: true,
        lockedAt: new Date().toISOString(),
      };
      saveResults();
    }
    log("RESULT_FINALIZED", { resultId: currentMatchSavedResultId }, context);
    emit();
    return { ok: true };
  }

  function onlyReady() {
    return status === "READY" ? null : { ok: false, code: "MATCH_NOT_READY" };
  }

  function addTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const name = cleanTeamName(data && data.name);
    if (!name) return { ok: false, code: "INVALID_TEAM_NAME" };
    if (findTeamNameIndex(name) >= 0) return { ok: false, code: "TEAM_NAME_ALREADY_EXISTS" };
    teamNames.push(name);
    const weight = normalizeTeamWeight(data && data.weight);
    if (weight !== null) setTeamWeight(name, weight);
    const school = cleanSchoolName(data && data.school);
    if (school) setTeamSchool(name, school);
    saveTeamData();
    log("TEAM_ADD", { name }, context);
    emit();
    return { ok: true };
  }

  function editTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const oldName = cleanTeamName(data && data.oldName);
    const newName = cleanTeamName(data && data.newName);
    const index = findTeamNameIndex(oldName);
    if (index < 0 || !newName) return { ok: false, code: "INVALID_TEAM_NAME" };
    const duplicate = findTeamNameIndex(newName);
    if (duplicate >= 0 && duplicate !== index) return { ok: false, code: "TEAM_NAME_ALREADY_EXISTS" };

    const previous = teamNames[index];
    const previousWeight = getTeamWeight(previous);
    const previousSchool = getTeamSchool(previous);
    teamNames[index] = newName;
    delete teamWeights[previous];
    delete teamSchools[previous];
    setTeamWeight(newName, data && data.weight === undefined ? previousWeight : data.weight);
    setTeamSchool(newName, data && data.school === undefined ? previousSchool : data.school);
    if (teamNameA === previous) teamNameA = newName;
    if (teamNameB === previous) teamNameB = newName;
    saveTeamData();
    log("TEAM_EDIT", { oldName: previous, newName }, context);
    emit();
    return { ok: true };
  }

  function selectTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const team = normalizeTeam(data && data.team);
    const selectedIndex = findTeamNameIndex(data && data.name);
    if (!team || selectedIndex < 0) return { ok: false, code: "INVALID_TEAM" };
    const selected = teamNames[selectedIndex];
    const other = team === "A" ? teamNameB : teamNameA;
    if (selected === other) return { ok: false, code: "SAME_TEAM_BOTH_SIDES" };
    if (team === "A") teamNameA = selected;
    else teamNameB = selected;
    saveTeamData();
    log("TEAM_SELECT", { side: team, name: selected }, context);
    emit();
    return { ok: true };
  }

  function deleteTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const name = cleanTeamName(data && data.name);
    const index = findTeamNameIndex(name);
    if (index < 0 || teamNames.length <= 2) return { ok: false, code: "TEAM_DELETE_NOT_ALLOWED" };
    const deleted = teamNames[index];
    teamNames.splice(index, 1);
    delete teamWeights[deleted];
    delete teamSchools[deleted];
    if (teamNameA === deleted) teamNameA = teamNames.find((item) => item !== teamNameB) || teamNames[0];
    if (teamNameB === deleted) teamNameB = teamNames.find((item) => item !== teamNameA) || teamNames[1] || teamNames[0];
    ensureDistinctSelectedTeams();
    saveTeamData();
    log("TEAM_DELETE", { name: deleted }, context);
    emit();
    return { ok: true };
  }

  function setNamesVisible(visible, context = {}) {
    teamNamesVisible = Boolean(visible);
    saveTeamData();
    log(teamNamesVisible ? "TEAM_NAMES_SHOW" : "TEAM_NAMES_HIDE", {}, context);
    emit();
    return { ok: true };
  }

  function deleteResult(data, context = {}) {
    if (status === "RUNNING" || status === "PAUSED") return { ok: false, code: "MATCH_ACTIVE", deleted: false, matchResults };
    const id = String(data && data.id || "").trim();
    if (!id) return { ok: false, code: "INVALID_RESULT", deleted: false, matchResults };
    const before = matchResults.length;
    matchResults = matchResults.filter((item) => item && item.id !== id);
    const deleted = before !== matchResults.length;
    if (deleted) {
      if (currentMatchSavedResultId === id) resetCurrentMatchSave();
      saveResults();
      log("RESULT_DELETE", { resultId: id }, context);
      emit();
    }
    return { ok: deleted, deleted, matchResults };
  }

  async function initialize() {
    await persistence.ensureDirectories();
    await loadTeamData();
    await loadResults();
    const recovery = await loadLiveState();
    saveTeamData();
    saveResults();
    persist(true);
    await persistence.flushAll();
    log("SERVER_READY", { recovery, rules });
    await eventLog.flush();
  }

  async function shutdown(context = {}) {
    if (status === "RUNNING") {
      syncTimerFromClock(context);
      if (status === "RUNNING") status = "PAUSED";
    }
    clearTimer();
    log("SERVER_SHUTDOWN", {}, context);
    persist(false);
    await Promise.all([persistence.flushAll(), eventLog.flush()]);
  }

  async function forcePersist() {
    persist(true);
    await Promise.all([persistence.flushAll(), eventLog.flush()]);
  }

  return {
    initialize,
    shutdown,
    forcePersist,
    getUpdateData: updateData,
    addScore,
    missionScore,
    missionShot,
    endWithBonus,
    resetTimer,
    startTimer,
    stopTimer,
    resetScore,
    resetAll,
    correctResult,
    finalizeResult,
    addTeam,
    editTeam,
    selectTeam,
    deleteTeam,
    setNamesVisible,
    deleteResult,
    recordEvent: log,
  };
}

module.exports = { createScoreboard, STATUSES };
