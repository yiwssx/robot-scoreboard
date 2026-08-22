"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { projectBroadcastState } = require("../src/broadcast/broadcast-projector");
const { TextFileBroadcastOutput, textFilesFromBroadcast } = require("../src/infrastructure/broadcast/text-file-output");
const { createClientRegistry } = require("../src/sockets/client-registry");

function source() {
  return {
    status: "RUNNING", time: "01.23", timeElapsed: 57, remainingSeconds: 123, matchDuration: 180,
    teamNameA: "ALPHA", teamNameB: "BETA", teamSchoolA: "A SCHOOL", teamSchoolB: "B SCHOOL",
    scoreA: 30, scoreB: 20, shotA: "00.45", shotB: "00.51", missionShotsA: ["00.10", "", "", ""], missionShotsB: ["", "", "", ""],
    teamNamesVisible: true, currentMatchSavedResultId: "r1", resultLocked: true,
    matchResults: [{ id: "r1", winner: "A", winnerName: "ALPHA", locked: true }],
    teamNames: ["ALPHA", "BETA", "SECRET"],
  };
}

test("broadcast projector exposes only presentation state and backend winner", () => {
  const projected = projectBroadcastState(source());
  assert.equal(projected.teamA.name, "ALPHA");
  assert.equal(projected.result.winnerName, "ALPHA");
  assert.equal(projected.match.time, "01.23");
  assert.equal(Object.hasOwn(projected, "teamNames"), false);
  assert.equal(Object.hasOwn(projected, "matchResults"), false);
});

test("text file adapter preserves legacy OBS filenames", () => {
  const files = textFilesFromBroadcast(projectBroadcastState(source()));
  assert.equal(files["score_a.txt"], 30);
  assert.equal(files["time.txt"], "01.23");
  assert.equal(files["team-name-a.text"], "ALPHA");
  assert.equal(files["nameschool-b.text"], "B SCHOOL");
  assert.equal(files["mission_shot_a_1.txt"], "00.10");
  assert.equal(Object.keys(files).length, 18);
});

test("central text broadcast output writes local files independently", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "broadcast-output-"));
  try {
    const output = new TextFileBroadcastOutput({ obsDir: root, debounceMs: 0 });
    await output.ensureDirectory();
    output.publish(projectBroadcastState(source()), true);
    await output.flushAll();
    assert.equal(await fs.readFile(path.join(root, "score_a.txt"), "utf8"), "30");
    assert.equal(output.health().ok, true);
    assert.equal(output.health().localOnly, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("client registry records thin field-client roles for diagnostics", () => {
  const registry = createClientRegistry();
  const socketA = { id: "a", handshake: { address: "192.168.1.51" }, request: {} };
  const socketB = { id: "b", handshake: { address: "192.168.1.52" }, request: {} };
  registry.connect(socketA, { role: "team-a" });
  registry.connect(socketB, { role: "team-b" });
  const summary = registry.summary();
  assert.equal(summary.total, 2);
  assert.equal(summary.counts["team-a"], 1);
  assert.equal(summary.counts["team-b"], 1);
  registry.disconnect(socketA);
  assert.equal(registry.summary().total, 1);
});
