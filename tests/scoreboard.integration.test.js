"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createScoreboard } = require("../server/competition/use-cases/scoreboard.service");

const fastRules = {
  matchDurationSeconds: 1,
  finalWarningSeconds: 1,
  scoreAdjustments: [-20, -10, 10, 20],
  missions: { 1: 10, 2: 20, 3: 20, 4: 20 },
};

async function fixture(rules = fastRules) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "robot-scoreboard-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");
  const scoreboard = createScoreboard({ dataDir, obsDir, rules });
  await scoreboard.initialize();
  return { root, dataDir, obsDir, scoreboard };
}

async function cleanup(item) {
  try { await item.scoreboard.shutdown(); } catch {}
  await fs.rm(item.root, { recursive: true, force: true });
}

test("state machine only accepts scoring while RUNNING", async () => {
  const item = await fixture();
  try {
    assert.equal(item.scoreboard.getUpdateData().status, "READY");
    assert.equal(item.scoreboard.addScore("A", 10).code, "MATCH_NOT_RUNNING");
    assert.equal(item.scoreboard.startTimer().ok, true);
    assert.equal(item.scoreboard.getUpdateData().status, "RUNNING");
    assert.equal(item.scoreboard.addScore("A", 10).ok, true);
    assert.equal(item.scoreboard.stopTimer().ok, true);
    assert.equal(item.scoreboard.getUpdateData().status, "PAUSED");
    assert.equal(item.scoreboard.addScore("A", 10).code, "MATCH_NOT_RUNNING");
    assert.equal(item.scoreboard.startTimer().ok, true);
  } finally { await cleanup(item); }
});

test("RESET ALL is rejected while RUNNING or PAUSED", async () => {
  const item = await fixture();
  try {
    item.scoreboard.startTimer();
    assert.equal(item.scoreboard.resetAll().code, "MATCH_ACTIVE");
    item.scoreboard.stopTimer();
    assert.equal(item.scoreboard.resetAll().code, "MATCH_ACTIVE");
  } finally { await cleanup(item); }
});

test("duplicate mission cannot score twice", async () => {
  const item = await fixture();
  try {
    item.scoreboard.startTimer();
    assert.deepEqual(item.scoreboard.missionScore("A", 1), { ok: true, point: 10 });
    assert.equal(item.scoreboard.missionScore("A", 1).code, "MISSION_ALREADY_RECORDED");
    assert.equal(item.scoreboard.getUpdateData().scoreA, 10);
  } finally { await cleanup(item); }
});

test("TEAM A and TEAM B cannot select the same team and duplicate rename is rejected", async () => {
  const item = await fixture({ ...fastRules, matchDurationSeconds: 3 });
  try {
    assert.equal(item.scoreboard.addTeam({ name: "RCAT" }).ok, true);
    assert.equal(item.scoreboard.selectTeam({ team: "A", name: "RCAT" }).ok, true);
    assert.equal(item.scoreboard.selectTeam({ team: "B", name: "RCAT" }).code, "SAME_TEAM_BOTH_SIDES");
    assert.equal(item.scoreboard.editTeam({ oldName: "TEAM B", newName: "RCAT" }).code, "TEAM_NAME_ALREADY_EXISTS");
  } finally { await cleanup(item); }
});

test("power-loss snapshot that was RUNNING recovers as PAUSED with score intact", async () => {
  const item = await fixture({ ...fastRules, matchDurationSeconds: 5 });
  let recovered;
  try {
    item.scoreboard.startTimer();
    item.scoreboard.addScore("A", 20);
    await item.scoreboard.forcePersist();

    const snapshot = await fs.mkdtemp(path.join(os.tmpdir(), "robot-scoreboard-snapshot-"));
    await fs.cp(item.dataDir, path.join(snapshot, "data"), { recursive: true });
    await fs.cp(item.obsDir, path.join(snapshot, "obs"), { recursive: true });

    recovered = createScoreboard({ dataDir: path.join(snapshot, "data"), obsDir: path.join(snapshot, "obs"), rules: { ...fastRules, matchDurationSeconds: 5 } });
    await recovered.initialize();
    assert.equal(recovered.getUpdateData().status, "PAUSED");
    assert.equal(recovered.getUpdateData().scoreA, 20);
    await recovered.shutdown();
    await fs.rm(snapshot, { recursive: true, force: true });
  } finally { await cleanup(item); }
});

test("finish auto-saves once, supports review correction, requires finalize before next match", async () => {
  const item = await fixture();
  try {
    item.scoreboard.startTimer();
    item.scoreboard.addScore("A", 10);
    await new Promise((resolve) => setTimeout(resolve, 1150));
    const finished = item.scoreboard.getUpdateData();
    assert.equal(finished.status, "FINISH");
    assert.equal(finished.matchResults.length, 1);
    assert.equal(finished.resultReviewRequired, true);
    assert.equal(item.scoreboard.resetAll().code, "RESULT_NOT_LOCKED");

    assert.equal(item.scoreboard.correctResult({ type: "score", team: "B", delta: 20 }).ok, true);
    assert.equal(item.scoreboard.correctResult({ type: "shot", team: "B", value: "00.01" }).ok, true);
    assert.equal(item.scoreboard.finalizeResult().ok, true);
    assert.equal(item.scoreboard.getUpdateData().resultLocked, true);
    assert.equal(item.scoreboard.resetAll().ok, true);
    assert.equal(item.scoreboard.getUpdateData().status, "READY");
  } finally { await cleanup(item); }
});

test("restart after FINISH does not duplicate result", async () => {
  const item = await fixture();
  try {
    item.scoreboard.startTimer();
    await new Promise((resolve) => setTimeout(resolve, 1150));
    assert.equal(item.scoreboard.getUpdateData().matchResults.length, 1);
    await item.scoreboard.forcePersist();
    await item.scoreboard.shutdown();

    const second = createScoreboard({ dataDir: item.dataDir, obsDir: item.obsDir, rules: fastRules });
    await second.initialize();
    assert.equal(second.getUpdateData().matchResults.length, 1);
    assert.equal(second.getUpdateData().status, "FINISH");
    await second.shutdown();
  } finally { await fs.rm(item.root, { recursive: true, force: true }); }
});

test("corrupt primary JSON does not prevent server boot", async () => {
  const item = await fixture();
  try {
    await item.scoreboard.shutdown();
    await fs.writeFile(path.join(item.dataDir, "live-match-state.json"), "{broken", "utf8");
    const second = createScoreboard({ dataDir: item.dataDir, obsDir: item.obsDir, rules: fastRules });
    await second.initialize();
    assert.ok(["READY", "PAUSED", "FINISH"].includes(second.getUpdateData().status));
    await second.shutdown();
  } finally { await fs.rm(item.root, { recursive: true, force: true }); }
});

test("OBS output and event log are persisted", async () => {
  const item = await fixture({ ...fastRules, matchDurationSeconds: 3 });
  try {
    item.scoreboard.startTimer();
    item.scoreboard.addScore("A", 10);
    item.scoreboard.missionScore("B", 1);
    item.scoreboard.stopTimer();
    await item.scoreboard.forcePersist();
    assert.equal(await fs.readFile(path.join(item.obsDir, "score_a.txt"), "utf8"), "10");
    assert.equal(await fs.readFile(path.join(item.obsDir, "score_b.txt"), "utf8"), "10");
    const log = await fs.readFile(path.join(item.dataDir, "event-log.ndjson"), "utf8");
    assert.match(log, /MATCH_START/);
    assert.match(log, /SCORE_ADJUST/);
    assert.match(log, /MISSION_SCORE/);
  } finally { await cleanup(item); }
});
