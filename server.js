"use strict";

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Server } = require("socket.io");
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
} = require("./src/domain");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.SCOREBOARD_DATA_DIR || path.join(__dirname, "data");
const OBS_DIR = process.env.SCOREBOARD_OBS_DIR || path.join(__dirname, "obs");
const COOKIE_NAME = "scoreboard_access";
const MAX_RESULTS = 200;
const WRITE_DEBOUNCE_MS = 50;
const TIMER_POLL_MS = 100;

const ROLE = Object.freeze({
  PUBLIC: "PUBLIC",
  CONTROL: "CONTROL",
  TEAM_A: "TEAM_A",
  TEAM_B: "TEAM_B",
  LEGACY: "LEGACY",
});

const accessTokens = Object.freeze({
  [ROLE.CONTROL]: String(process.env.SCOREBOARD_CONTROL_TOKEN || "").trim(),
  [ROLE.TEAM_A]: String(process.env.SCOREBOARD_TEAM_A_TOKEN || "").trim(),
  [ROLE.TEAM_B]: String(process.env.SCOREBOARD_TEAM_B_TOKEN || "").trim(),
});
const securityEnabled = Object.values(accessTokens).some(Boolean);
const configuredOrigins = String(process.env.SCOREBOARD_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  allowRequest: (req, callback) => callback(null, isOriginAllowed(req)),
});

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

const teamDataFile = path.join(DATA_DIR, "team-names.json");
const matchResultsFile = path.join(DATA_DIR, "match-results.json");
const liveMatchStateFile = path.join(DATA_DIR, "live-match-state.json");
const legacyTeamDataFile = path.join(OBS_DIR, "team-names.json");
const legacyMatchResultsFile = path.join(OBS_DIR, "match-results.json");
const legacyLiveMatchStateFile = path.join(OBS_DIR, "live-match-state.json");

const pendingWrites = new Map();
const lastObsValues = new Map();
let writeTimer = null;
let writeChain = Promise.resolve();

function isOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === req.headers.host;
  } catch {
    return false;
  }
}

function safeTokenEquals(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function roleForToken(token) {
  if (!securityEnabled) return ROLE.LEGACY;
  for (const [role, configuredToken] of Object.entries(accessTokens)) {
    if (configuredToken && safeTokenEquals(token, configuredToken)) return role;
  }
  return ROLE.PUBLIC;
}

function parseCookies(header) {
  const result = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (!key) return;
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    });
  return result;
}

function roleForSocket(socket) {
  if (!securityEnabled) return ROLE.LEGACY;
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return roleForToken(cookies[COOKIE_NAME]);
}

function canControlTeam(role, team) {
  if (role === ROLE.LEGACY || role === ROLE.CONTROL) return true;
  return (role === ROLE.TEAM_A && team === "A") || (role === ROLE.TEAM_B && team === "B");
}

function canControlTimer(role) {
  return role === ROLE.LEGACY || role === ROLE.CONTROL || role === ROLE.TEAM_A || role === ROLE.TEAM_B;
}

function canAdmin(role) {
  return role === ROLE.LEGACY || role === ROLE.CONTROL;
}

function rejectAction(socket, event, callback, code = "FORBIDDEN") {
  const payload = { ok: false, event, code };
  socket.emit("action-error", payload);
  if (typeof callback === "function") callback(payload);
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (/\.(?:html|css|js)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  if (securityEnabled && typeof req.query.token === "string") {
    const token = req.query.token.trim();
    const role = roleForToken(token);
    if (role === ROLE.PUBLIC) return res.status(403).send("Invalid scoreboard access token");

    const cleanUrl = new URL(req.originalUrl, `http://${req.headers.host || "localhost"}`);
    cleanUrl.searchParams.delete("token");
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.SCOREBOARD_SECURE_COOKIE === "1",
      maxAge: 12 * 60 * 60 * 1000,
    });
    return res.redirect(302, `${cleanUrl.pathname}${cleanUrl.search}`);
  }

  next();
});

app.get("/healthz", (req, res) => {
  res.json({ ok: true, status, securityEnabled, uptimeSeconds: Math.floor(process.uptime()) });
});

app.use(express.static("public"));

function queueWrite(filePath, content) {
  pendingWrites.set(filePath, String(content));
  if (writeTimer === null) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void flushPendingWrites();
    }, WRITE_DEBOUNCE_MS);
  }
}

async function atomicWrite(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, content, "utf8");
  await fsp.rename(tempPath, filePath);
}

function flushPendingWrites() {
  if (pendingWrites.size === 0) return writeChain;
  const batch = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  writeChain = writeChain
    .then(() => Promise.all(batch.map(([filePath, content]) => atomicWrite(filePath, content))))
    .catch((error) => console.error("Persistence write failed:", error));

  if (pendingWrites.size > 0 && writeTimer === null) {
    writeTimer = setTimeout(() => {
      writeTimer = null;
      void flushPendingWrites();
    }, WRITE_DEBOUNCE_MS);
  }
  return writeChain;
}

async function flushAllWrites() {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  while (pendingWrites.size > 0) await flushPendingWrites();
  await writeChain;
}

function queueJson(filePath, data) {
  queueWrite(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Could not read ${filePath}:`, error.message);
    return fallback;
  }
}

async function firstExistingJson(primaryPath, legacyPath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(primaryPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Could not read ${primaryPath}:`, error.message);
  }
  return readJson(legacyPath, fallback);
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
  const cleanSchool = cleanSchoolName(school);
  if (!cleanName) return;
  if (!cleanSchool) delete teamSchools[cleanName];
  else teamSchools[cleanName] = cleanSchool;
}

function findTeamNameIndex(name) {
  const cleanName = cleanTeamName(name).toLocaleLowerCase();
  return teamNames.findIndex((teamName) => teamName.toLocaleLowerCase() === cleanName);
}

function addTeamNameToList(name) {
  const cleanName = cleanTeamName(name);
  if (!cleanName) return "";
  const existingIndex = findTeamNameIndex(cleanName);
  if (existingIndex === -1) {
    teamNames.push(cleanName);
    return cleanName;
  }
  return teamNames[existingIndex];
}

function normalizeTeamList(names) {
  teamNames = [];
  if (Array.isArray(names)) names.forEach((name) => addTeamNameToList(name));
  if (teamNames.length === 0) teamNames = ["TEAM A", "TEAM B"];
}

async function readLegacyText(fileName) {
  try {
    return cleanTeamName(await fsp.readFile(path.join(OBS_DIR, fileName), "utf8"));
  } catch {
    return "";
  }
}

async function loadTeamNameData() {
  const savedData = await firstExistingJson(teamDataFile, legacyTeamDataFile, null);
  if (savedData && typeof savedData === "object") {
    normalizeTeamList(savedData.teamNames);
    teamWeights = {};
    teamSchools = {};
    teamNames.forEach((name) => setTeamWeight(name, savedData.teamWeights && savedData.teamWeights[name]));
    teamNames.forEach((name) => setTeamSchool(name, savedData.teamSchools && savedData.teamSchools[name]));
    teamNameA = cleanTeamName(savedData.teamNameA) || teamNames[0] || "TEAM A";
    teamNameB = cleanTeamName(savedData.teamNameB) || teamNames[1] || teamNames[0] || "TEAM B";
    teamNamesVisible = typeof savedData.teamNamesVisible === "boolean" ? savedData.teamNamesVisible : true;
    teamNameA = addTeamNameToList(teamNameA);
    teamNameB = addTeamNameToList(teamNameB);
    return;
  }

  const savedNameA = await readLegacyText("team-name-a.text");
  const savedNameB = await readLegacyText("team-name-b.text");
  teamNameA = addTeamNameToList(savedNameA || "TEAM A");
  teamNameB = addTeamNameToList(savedNameB || "TEAM B");
}

function saveTeamNameData() {
  queueJson(teamDataFile, { teamNames, teamWeights, teamSchools, teamNameA, teamNameB, teamNamesVisible });
}

function normalizeMatchResult(result) {
  const safeResult = result && typeof result === "object" ? result : {};
  const winnerInfo = getWinnerInfoFromValues(
    safeResult.scoreA,
    safeResult.scoreB,
    safeResult.shotA,
    safeResult.shotB,
    safeResult.teamWeightA,
    safeResult.teamWeightB,
    safeResult.teamNameA,
    safeResult.teamNameB
  );
  return { ...safeResult, winner: winnerInfo.winner, winnerName: winnerInfo.winnerName };
}

async function loadMatchResults() {
  const savedData = await firstExistingJson(matchResultsFile, legacyMatchResultsFile, []);
  matchResults = Array.isArray(savedData) ? savedData.map(normalizeMatchResult).slice(0, MAX_RESULTS) : [];
}

function saveMatchResults() {
  queueJson(matchResultsFile, matchResults);
}

async function loadLiveMatchState() {
  const savedData = await firstExistingJson(liveMatchStateFile, legacyLiveMatchStateFile, null);
  if (!savedData || typeof savedData !== "object") return;

  const savedScoreA = Number(savedData.scoreA);
  const savedScoreB = Number(savedData.scoreB);
  scoreA = Number.isFinite(savedScoreA) ? Math.max(Math.floor(savedScoreA), 0) : 0;
  scoreB = Number.isFinite(savedScoreB) ? Math.max(Math.floor(savedScoreB), 0) : 0;
  matchDuration = normalizeMatchDuration(savedData.matchDuration, 180);
  const savedElapsed = Number(savedData.timeElapsed);
  timeElapsed = Number.isFinite(savedElapsed) ? Math.min(Math.max(Math.floor(savedElapsed), 0), matchDuration) : 0;
  shotA = String(savedData.shotA || "");
  shotB = String(savedData.shotB || "");
  const hasRecordedMissionShotsA = Array.isArray(savedData.recordedMissionShotsA);
  const hasRecordedMissionShotsB = Array.isArray(savedData.recordedMissionShotsB);
  missionShotsA = normalizeMissionShots(hasRecordedMissionShotsA ? savedData.recordedMissionShotsA : savedData.missionShotsA);
  missionShotsB = normalizeMissionShots(hasRecordedMissionShotsB ? savedData.recordedMissionShotsB : savedData.missionShotsB);
  teamNameA = addTeamNameToList(savedData.teamNameA || teamNameA) || teamNameA;
  teamNameB = addTeamNameToList(savedData.teamNameB || teamNameB) || teamNameB;

  const savedStatus = String(savedData.status || "STOP").toUpperCase();
  status = new Set(["STOP", "RUNNING", "FINISH"]).has(savedStatus) ? savedStatus : "STOP";
  const finishTime = formatTime(matchDuration);
  if (!hasRecordedMissionShotsA && status === "FINISH" && shotA === finishTime && missionShotsA[3] === finishTime) missionShotsA[3] = "";
  if (!hasRecordedMissionShotsB && status === "FINISH" && shotB === finishTime && missionShotsB[3] === finishTime) missionShotsB[3] = "";
  if (status === "RUNNING") status = "STOP";

  const savedResultId = String(savedData.currentMatchSavedResultId || "");
  currentMatchSaved = Boolean(savedData.currentMatchSaved && savedResultId && matchResults.some((result) => result && result.id === savedResultId));
  currentMatchSavedResultId = currentMatchSaved ? savedResultId : "";
}

function getWinnerInfo() {
  return getWinnerInfoFromValues(scoreA, scoreB, shotA, shotB, getTeamWeight(teamNameA), getTeamWeight(teamNameB), teamNameA, teamNameB);
}

function getCurrentMatchResultFields() {
  const winnerInfo = getWinnerInfo();
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
    winner: winnerInfo.winner,
    winnerName: winnerInfo.winnerName,
  };
}

function resetCurrentMatchSave() {
  currentMatchSaved = false;
  currentMatchSavedResultId = "";
}

function getNextMatchNumber() {
  return matchResults.reduce((highest, result) => {
    const matchNumber = Number(result && result.matchNumber);
    return Number.isFinite(matchNumber) ? Math.max(highest, matchNumber) : highest;
  }, 0) + 1;
}

function saveCurrentMatchResult(mode) {
  if (currentMatchSaved) {
    return { saved: false, result: matchResults.find((result) => result.id === currentMatchSavedResultId) || null };
  }
  const result = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    matchNumber: getNextMatchNumber(),
    savedAt: new Date().toISOString(),
    mode: mode === "auto" ? "auto" : "manual",
    ...getCurrentMatchResultFields(),
  };
  matchResults = [result, ...matchResults].slice(0, MAX_RESULTS);
  currentMatchSaved = true;
  currentMatchSavedResultId = result.id;
  saveMatchResults();
  return { saved: true, result };
}

function updateCurrentMatchResult() {
  if (!currentMatchSaved || !currentMatchSavedResultId) return false;
  const index = matchResults.findIndex((result) => result && result.id === currentMatchSavedResultId);
  if (index === -1) return false;
  matchResults[index] = { ...matchResults[index], ...getCurrentMatchResultFields() };
  saveMatchResults();
  return true;
}

function deleteMatchResult(id) {
  const resultId = String(id || "").trim();
  if (!resultId) return false;
  const before = matchResults.length;
  matchResults = matchResults.filter((result) => result && result.id !== resultId);
  const deleted = matchResults.length !== before;
  if (deleted) {
    if (currentMatchSavedResultId === resultId) resetCurrentMatchSave();
    saveMatchResults();
  }
  return deleted;
}

function getLivePersistenceData() {
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

function getUpdateData() {
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

function getObsValues() {
  const values = {
    "score_a.txt": String(scoreA),
    "score_b.txt": String(scoreB),
    "time.txt": formatTime(timeElapsed),
    "shot_a.txt": shotA,
    "shot_b.txt": shotB,
    "status.txt": status,
    "team-name-a.text": teamNamesVisible ? teamNameA : "",
    "team-name-b.text": teamNamesVisible ? teamNameB : "",
    "nameschool-a.text": teamNamesVisible ? getTeamSchool(teamNameA) : "",
    "nameschool-b.text": teamNamesVisible ? getTeamSchool(teamNameB) : "",
  };
  normalizeMissionShots(missionShotsA).forEach((value, index) => { values[`mission_shot_a_${index + 1}.txt`] = value; });
  normalizeMissionShots(missionShotsB).forEach((value, index) => { values[`mission_shot_b_${index + 1}.txt`] = value; });
  return values;
}

function queueObsWrites(force = false) {
  for (const [fileName, value] of Object.entries(getObsValues())) {
    if (!force && lastObsValues.get(fileName) === value) continue;
    lastObsValues.set(fileName, value);
    queueWrite(path.join(OBS_DIR, fileName), value);
  }
}

function persistLiveState() {
  queueJson(liveMatchStateFile, getLivePersistenceData());
  queueObsWrites(false);
}

function emitUpdate(options = {}) {
  io.emit("update", getUpdateData());
  if (options.persist !== false) persistLiveState();
}

function sendCurrentState(socket) {
  socket.emit("update", getUpdateData());
}

function clearTimerHandle() {
  if (timerHandle !== null) clearInterval(timerHandle);
  timerHandle = null;
  timerStartedAtNs = null;
}

function fillMissingShotsWithFinishTime() {
  const finishTime = formatTime(matchDuration);
  if (shotA === "") shotA = finishTime;
  if (shotB === "") shotB = finishTime;
}

function finishTimer() {
  clearTimerHandle();
  timeElapsed = matchDuration;
  status = "FINISH";
  fillMissingShotsWithFinishTime();
  saveCurrentMatchResult("auto");
}

function syncTimerFromClock() {
  if (status !== "RUNNING" || timerStartedAtNs === null) return false;
  const nextElapsed = elapsedSecondsFromClock(timerBaseElapsedMs, timerStartedAtNs, process.hrtime.bigint(), matchDuration);
  const changed = nextElapsed !== timeElapsed;
  timeElapsed = nextElapsed;
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
    if (syncTimerFromClock()) emitUpdate();
  }, TIMER_POLL_MS);
  emitUpdate();
  return true;
}

function stopTimer() {
  if (status === "FINISH") return false;
  syncTimerFromClock();
  clearTimerHandle();
  status = "STOP";
  emitUpdate();
  return true;
}

function resetTimer(seconds = 180) {
  clearTimerHandle();
  matchDuration = normalizeMatchDuration(seconds, 180);
  timeElapsed = 0;
  shotA = "";
  shotB = "";
  missionShotsA = ["", "", "", ""];
  missionShotsB = ["", "", "", ""];
  status = "STOP";
  resetCurrentMatchSave();
  emitUpdate();
}

function addScore(team, point, options = {}) {
  if (status === "FINISH" && !options.allowAfterFinish) return false;
  if (team === "A") scoreA = Math.max(scoreA + point, 0);
  else if (team === "B") scoreB = Math.max(scoreB + point, 0);
  else return false;
  return true;
}

function getMissionShotList(team) {
  if (team === "A") return missionShotsA;
  if (team === "B") return missionShotsB;
  return null;
}

function hasRecordedMissionShot(team, mission) {
  const shots = getMissionShotList(team);
  const index = Number(mission) - 1;
  return Boolean(shots && index >= 0 && index < 4 && shots[index] !== "");
}

function recordMissionShot(team, mission, options = {}) {
  syncTimerFromClock();
  const shots = getMissionShotList(team);
  const index = Number(mission) - 1;
  const canRecordAfterFinish = options.allowAfterFinish && index === 3;
  if (status === "FINISH" && !canRecordAfterFinish) return false;
  if (!shots || index < 0 || index >= 4 || shots[index] !== "") return false;
  const shotTime = formatTime(timeElapsed);
  shots[index] = shotTime;
  if (index === 3) {
    if (team === "A" && shotA === "") shotA = shotTime;
    if (team === "B" && shotB === "") shotB = shotTime;
  }
  return true;
}

function setTeamNamesVisible(visible) {
  teamNamesVisible = Boolean(visible);
  saveTeamNameData();
  emitUpdate();
}

function setTeamName(team, name) {
  const selected = addTeamNameToList(name);
  if (!selected) return false;
  if (team === "A") teamNameA = selected;
  else if (team === "B") teamNameB = selected;
  else return false;
  saveTeamNameData();
  emitUpdate();
  return true;
}

function editTeamName(oldName, newName, weight, school) {
  const cleanOldName = cleanTeamName(oldName);
  const cleanNewName = cleanTeamName(newName);
  const index = findTeamNameIndex(cleanOldName);
  if (index === -1 || !cleanNewName) return false;

  const duplicateIndex = findTeamNameIndex(cleanNewName);
  if (duplicateIndex !== -1 && duplicateIndex !== index) {
    if (weight !== undefined) setTeamWeight(teamNames[duplicateIndex], weight);
    if (school !== undefined) setTeamSchool(teamNames[duplicateIndex], school);
    if (teamNameA === teamNames[index]) teamNameA = teamNames[duplicateIndex];
    if (teamNameB === teamNames[index]) teamNameB = teamNames[duplicateIndex];
    delete teamWeights[teamNames[index]];
    delete teamSchools[teamNames[index]];
    teamNames.splice(index, 1);
  } else {
    const previousName = teamNames[index];
    teamNames[index] = cleanNewName;
    const previousWeight = getTeamWeight(previousName);
    const previousSchool = getTeamSchool(previousName);
    delete teamWeights[previousName];
    delete teamSchools[previousName];
    setTeamWeight(cleanNewName, weight === undefined ? previousWeight : weight);
    setTeamSchool(cleanNewName, school === undefined ? previousSchool : school);
    if (teamNameA === previousName) teamNameA = cleanNewName;
    if (teamNameB === previousName) teamNameB = cleanNewName;
  }
  saveTeamNameData();
  emitUpdate();
  return true;
}

function deleteTeamName(name) {
  const cleanName = cleanTeamName(name);
  const index = findTeamNameIndex(cleanName);
  if (index === -1 || teamNames.length <= 1) return false;
  const deletedName = teamNames[index];
  teamNames.splice(index, 1);
  delete teamWeights[deletedName];
  delete teamSchools[deletedName];
  if (teamNameA === deletedName) teamNameA = teamNames.find((item) => item !== teamNameB) || teamNames[0] || "TEAM A";
  if (teamNameB === deletedName) teamNameB = teamNames.find((item) => item !== teamNameA) || teamNames[0] || "TEAM B";
  saveTeamNameData();
  emitUpdate();
  return true;
}

io.on("connection", (socket) => {
  const role = roleForSocket(socket);
  socket.data.role = role;
  sendCurrentState(socket);

  socket.on("add-score", (data, callback) => {
    const team = normalizeTeam(data && data.team);
    const point = normalizeScoreDelta(data && data.point);
    if (!team || point === null) return rejectAction(socket, "add-score", callback, "INVALID_COMMAND");
    if (!canControlTeam(role, team)) return rejectAction(socket, "add-score", callback);
    syncTimerFromClock();
    if (!addScore(team, point)) return rejectAction(socket, "add-score", callback, "MATCH_FINISHED");
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("mission-score", (data, callback) => {
    const team = normalizeTeam(data && data.team);
    const mission = Number(data && data.mission);
    const point = getMissionPoint(mission);
    if (!team || point === null) return rejectAction(socket, "mission-score", callback, "INVALID_COMMAND");
    if (!canControlTeam(role, team)) return rejectAction(socket, "mission-score", callback);
    syncTimerFromClock();
    if (status === "FINISH") return rejectAction(socket, "mission-score", callback, "MATCH_FINISHED");
    if (hasRecordedMissionShot(team, mission)) return rejectAction(socket, "mission-score", callback, "MISSION_ALREADY_RECORDED");
    addScore(team, point);
    recordMissionShot(team, mission);
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true, point });
  });

  socket.on("mission-shot", (data, callback) => {
    const team = normalizeTeam(data && data.team);
    const mission = Number(data && data.mission);
    if (!team || getMissionPoint(mission) === null) return rejectAction(socket, "mission-shot", callback, "INVALID_COMMAND");
    if (!canControlTeam(role, team)) return rejectAction(socket, "mission-shot", callback);
    if (!recordMissionShot(team, mission)) return rejectAction(socket, "mission-shot", callback, "MISSION_NOT_RECORDABLE");
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("end-with-bonus", (data, callback) => {
    const team = normalizeTeam(data && data.team);
    if (!team) return rejectAction(socket, "end-with-bonus", callback, "INVALID_COMMAND");
    if (!canControlTeam(role, team)) return rejectAction(socket, "end-with-bonus", callback);
    if (hasRecordedMissionShot(team, 4)) return rejectAction(socket, "end-with-bonus", callback, "MISSION_ALREADY_RECORDED");
    if (!recordMissionShot(team, 4, { allowAfterFinish: true })) return rejectAction(socket, "end-with-bonus", callback, "MISSION_NOT_RECORDABLE");
    addScore(team, getMissionPoint(4), { allowAfterFinish: true });
    if (status === "FINISH") updateCurrentMatchResult();
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true, point: getMissionPoint(4) });
  });

  socket.on("set-time", (seconds, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "set-time", callback);
    resetTimer(seconds);
    if (typeof callback === "function") callback({ ok: true, matchDuration });
  });

  socket.on("start-time", (callback) => {
    if (!canControlTimer(role)) return rejectAction(socket, "start-time", callback);
    const started = startTimer();
    if (typeof callback === "function") callback({ ok: started, status });
  });

  socket.on("stop-time", (callback) => {
    if (!canControlTimer(role)) return rejectAction(socket, "stop-time", callback);
    const stopped = stopTimer();
    if (typeof callback === "function") callback({ ok: stopped, status });
  });

  socket.on("reset-score", (callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "reset-score", callback);
    if (status === "RUNNING") return rejectAction(socket, "reset-score", callback, "MATCH_RUNNING");
    scoreA = 0;
    scoreB = 0;
    shotA = "";
    shotB = "";
    missionShotsA = ["", "", "", ""];
    missionShotsB = ["", "", "", ""];
    timeElapsed = 0;
    status = "STOP";
    resetCurrentMatchSave();
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("reset-all", (callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "reset-all", callback);
    scoreA = 0;
    scoreB = 0;
    resetTimer(180);
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("force-sync", (callback) => {
    io.emit("update", getUpdateData());
    if (typeof callback === "function") callback({ synced: true, ok: true });
  });

  socket.on("team-name-add", (data, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-name-add", callback);
    const name = addTeamNameToList(data && data.name);
    if (!name) return rejectAction(socket, "team-name-add", callback, "INVALID_TEAM_NAME");
    const weight = normalizeTeamWeight(data && data.weight);
    if (weight !== null) setTeamWeight(name, weight);
    const school = cleanSchoolName(data && data.school);
    if (school) setTeamSchool(name, school);
    saveTeamNameData();
    emitUpdate();
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("team-name-edit", (data, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-name-edit", callback);
    const edited = editTeamName(data && data.oldName, data && data.newName, data && data.weight, data && data.school);
    if (typeof callback === "function") callback({ ok: edited });
  });

  socket.on("team-name-select", (data, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-name-select", callback);
    const team = normalizeTeam(data && data.team);
    const selected = team ? setTeamName(team, data && data.name) : false;
    if (typeof callback === "function") callback({ ok: selected });
  });

  socket.on("team-name-delete", (data, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-name-delete", callback);
    const deleted = deleteTeamName(data && data.name);
    if (typeof callback === "function") callback({ ok: deleted });
  });

  socket.on("team-names-show", (callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-names-show", callback);
    setTeamNamesVisible(true);
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("team-names-hide", (callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "team-names-hide", callback);
    setTeamNamesVisible(false);
    if (typeof callback === "function") callback({ ok: true });
  });

  socket.on("match-result-delete", (data, callback) => {
    if (!canAdmin(role)) return rejectAction(socket, "match-result-delete", callback);
    const deleted = deleteMatchResult(data && data.id);
    emitUpdate();
    if (typeof callback === "function") callback({ deleted, matchResults, ok: deleted });
  });
});

async function bootstrap() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(OBS_DIR, { recursive: true });
  await loadTeamNameData();
  await loadMatchResults();
  await loadLiveMatchState();
  saveTeamNameData();
  saveMatchResults();
  queueJson(liveMatchStateFile, getLivePersistenceData());
  queueObsWrites(true);
  await flushAllWrites();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Security mode: ${securityEnabled ? "token-protected" : "legacy LAN (no tokens configured)"}`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; saving scoreboard state...`);
  if (status === "RUNNING") syncTimerFromClock();
  clearTimerHandle();
  queueJson(liveMatchStateFile, getLivePersistenceData());
  queueObsWrites(false);
  await flushAllWrites();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error) => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
