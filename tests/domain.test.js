"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeScoreDelta,
  getMissionPoint,
  normalizeTeamWeight,
  parseShotTime,
  normalizeCorrectionTime,
  elapsedSecondsFromClock,
  getWinnerInfoFromValues,
} = require("../server/competition/domain");
const { normalizeRules } = require("../server/config/competition-rules");

const rules = normalizeRules({
  matchDurationSeconds: 180,
  finalWarningSeconds: 10,
  scoreAdjustments: [-20, -10, 10, 20],
  missions: { 1: 10, 2: 20, 3: 20, 4: 20 },
});

test("score deltas are server-whitelisted", () => {
  assert.equal(normalizeScoreDelta(10, rules.scoreAdjustments), 10);
  assert.equal(normalizeScoreDelta(-20, rules.scoreAdjustments), -20);
  assert.equal(normalizeScoreDelta(999, rules.scoreAdjustments), null);
});

test("mission points come from competition rules", () => {
  assert.equal(getMissionPoint(1, rules.missions), 10);
  assert.equal(getMissionPoint(4, rules.missions), 20);
  assert.equal(getMissionPoint(5, rules.missions), null);
});

test("weight is normalized to one decimal", () => {
  assert.equal(normalizeTeamWeight(12.54), 12.5);
  assert.equal(normalizeTeamWeight(0), null);
});

test("shot time parser accepts dot or colon and correction is bounded", () => {
  assert.equal(parseShotTime("02.30"), 150);
  assert.equal(parseShotTime("02:30"), 150);
  assert.equal(parseShotTime("02.70"), null);
  assert.equal(normalizeCorrectionTime("02:30", 180), "02.30");
  assert.equal(normalizeCorrectionTime("03.01", 180), null);
});

test("winner order is score, shot, weight, draw", () => {
  assert.equal(getWinnerInfoFromValues(20, 10, "", "", 10, 9, "A", "B").winner, "A");
  assert.equal(getWinnerInfoFromValues(20, 20, "01.10", "01.20", 10, 9, "A", "B").winner, "A");
  assert.equal(getWinnerInfoFromValues(20, 20, "01.10", "01.10", 10, 9, "A", "B").winner, "B");
  assert.equal(getWinnerInfoFromValues(20, 20, "01.10", "01.10", 10, 10, "A", "B").winner, "DRAW");
});

test("monotonic timer catches up after event-loop delay", () => {
  const start = 1_000_000_000n;
  const now = start + 5_400_000_000n;
  assert.equal(elapsedSecondsFromClock(10_000, start, now, 180), 15);
});
