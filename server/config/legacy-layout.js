"use strict";

const fs = require("node:fs");
const path = require("node:path");

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

function hasMeaningfulEntries(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => entry.name !== ".gitkeep");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function copyDirectoryContents(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
  }
}

function migrateLegacyLayout(projectRoot, env) {
  const runtimeRoot = path.join(projectRoot, "runtime");
  const defaultDataDir = path.join(runtimeRoot, "data");
  const defaultObsDir = path.join(runtimeRoot, "obs");
  const defaultRulesPath = path.join(runtimeRoot, "config", "competition-rules.json");

  // Environment overrides are explicit operator choices; never copy legacy files into them automatically.
  if (!samePath(env.dataDir, defaultDataDir) || !samePath(env.obsDir, defaultObsDir) || !samePath(env.rulesPath, defaultRulesPath)) {
    return { detected: false, migrated: [], skipped: "custom-runtime-paths" };
  }

  const legacyDataDir = path.join(projectRoot, "data");
  const legacyObsDir = path.join(projectRoot, "obs");
  const legacyRulesPath = path.join(projectRoot, "config", "competition-rules.json");
  const legacyData = hasMeaningfulEntries(legacyDataDir);
  const legacyObs = hasMeaningfulEntries(legacyObsDir);
  const detected = legacyData || legacyObs || fileExists(legacyRulesPath);

  if (!detected) return { detected: false, migrated: [] };
  if (hasMeaningfulEntries(env.dataDir) || hasMeaningfulEntries(env.obsDir)) {
    return { detected: true, migrated: [], skipped: "runtime-already-active" };
  }

  const migrated = [];
  if (legacyData) {
    copyDirectoryContents(legacyDataDir, env.dataDir);
    migrated.push("data");
  }
  if (legacyObs) {
    copyDirectoryContents(legacyObsDir, env.obsDir);
    migrated.push("obs");
  }
  if (migrated.length > 0 && fileExists(legacyRulesPath)) {
    fs.mkdirSync(path.dirname(env.rulesPath), { recursive: true });
    fs.copyFileSync(legacyRulesPath, env.rulesPath);
    migrated.push("rules");
  }

  return { detected: true, migrated };
}

module.exports = { migrateLegacyLayout, hasMeaningfulEntries };
