"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_RULES = Object.freeze({
  matchDurationSeconds: 180,
  finalWarningSeconds: 10,
  scoreAdjustments: [-20, -10, 10, 20],
  missions: { 1: 10, 2: 20, 3: 20, 4: 20 },
});

function asPositiveInt(value, fallback, max = 3600) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > max) return fallback;
  return Math.floor(n);
}

function normalizeRules(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const scoreAdjustments = Array.isArray(source.scoreAdjustments)
    ? [...new Set(source.scoreAdjustments.map(Number).filter((n) => Number.isFinite(n) && n !== 0))]
    : [...DEFAULT_RULES.scoreAdjustments];

  const sourceMissions = source.missions && typeof source.missions === "object" ? source.missions : {};
  const missions = {};
  for (let mission = 1; mission <= 4; mission += 1) {
    const value = Number(sourceMissions[mission]);
    missions[mission] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_RULES.missions[mission];
  }

  return Object.freeze({
    matchDurationSeconds: asPositiveInt(source.matchDurationSeconds, DEFAULT_RULES.matchDurationSeconds),
    finalWarningSeconds: asPositiveInt(source.finalWarningSeconds, DEFAULT_RULES.finalWarningSeconds, 60),
    scoreAdjustments: scoreAdjustments.length ? scoreAdjustments : [...DEFAULT_RULES.scoreAdjustments],
    missions: Object.freeze(missions),
  });
}

function loadCompetitionRules(filePath = path.join(__dirname, "..", "config", "competition-rules.json")) {
  try {
    return normalizeRules(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch (error) {
    console.warn(`Could not load competition rules from ${filePath}: ${error.message}; using defaults.`);
    return normalizeRules(DEFAULT_RULES);
  }
}

module.exports = { DEFAULT_RULES, normalizeRules, loadCompetitionRules };
