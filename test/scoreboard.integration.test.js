"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createScoreboard } = require("../src/scoreboard");

test("offline scoreboard validates scoring, timer and OBS persistence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "robot-scoreboard-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");

  const scoreboard = createScoreboard({ dataDir, obsDir });
  await scoreboard.initialize();

  assert.equal(scoreboard.addScore("A", 999).ok, false);
  assert.equal(scoreboard.addScore("A", 10).ok, true);
  assert.equal(scoreboard.getUpdateData().scoreA, 10);

  assert.deepEqual(scoreboard.missionScore("A", 1), { ok: true, point: 10 });
  assert.equal(scoreboard.getUpdateData().scoreA, 20);
  assert.equal(scoreboard.missionScore("A", 1).ok, false);

  assert.equal(scoreboard.resetTimer(2), 2);
  assert.equal(scoreboard.startTimer(), true);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.ok(scoreboard.getUpdateData().timeElapsed >= 1);
  assert.equal(scoreboard.stopTimer(), true);

  await scoreboard.shutdown();

  assert.equal(await fs.readFile(path.join(obsDir, "score_a.txt"), "utf8"), "20");
  assert.match(await fs.readFile(path.join(obsDir, "time.txt"), "utf8"), /^00\.0[1-2]$/);

  await fs.rm(root, { recursive: true, force: true });
});
