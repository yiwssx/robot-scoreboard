"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeamWeight,
  parseShotTime,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
} = require("../src/domain");

test("score deltas are server-whitelisted", () => {
  assert.equal(normalizeScoreDelta(10), 10);
  assert.equal(normalizeScoreDelta("-20"), -20);
  assert.equal(normalizeScoreDelta(999999), null);
  assert.equal(normalizeScoreDelta(0), null);
});

test("mission points are defined by the server", () => {
  assert.equal(getMissionPoint(1), 10);
  assert.equal(getMissionPoint(2), 20);
  assert.equal(getMissionPoint(3), 20);
  assert.equal(getMissionPoint(4), 20);
  assert.equal(getMissionPoint(5), null);
});

test("weight is normalized to one decimal", () => {
  assert.equal(normalizeTeamWeight(12.54), 12.5);
  assert.equal(normalizeTeamWeight(0), null);
  assert.equal(normalizeTeamWeight("bad"), null);
});

test("shot time parser accepts dot or colon", () => {
  assert.equal(parseShotTime("01.42"), 102);
  assert.equal(parseShotTime("01:42"), 102);
  assert.equal(parseShotTime("01.60"), null);
});

test("winner order is score, shot, weight, draw", () => {
  assert.deepEqual(getWinnerInfoFromValues(20, 10, "", "", null, null, "A", "B"), { winner: "A", winnerName: "A" });
  assert.deepEqual(getWinnerInfoFromValues(20, 20, "00.20", "00.30", null, null, "A", "B"), { winner: "A", winnerName: "A" });
  assert.deepEqual(getWinnerInfoFromValues(20, 20, "00.20", "00.20", 20, 15, "A", "B"), { winner: "B", winnerName: "B" });
  assert.deepEqual(getWinnerInfoFromValues(20, 20, "00.20", "00.20", 15, 15, "A", "B"), { winner: "DRAW", winnerName: "DRAW" });
});

test("monotonic timer catches up after event-loop delay", () => {
  const started = 1_000_000_000n;
  const now = started + 5_750_000_000n;
  assert.equal(elapsedSecondsFromClock(10_000, started, now, 180), 15);
  assert.equal(elapsedSecondsFromClock(179_000, started, now, 180), 180);
});
