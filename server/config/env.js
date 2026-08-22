"use strict";

const path = require("node:path");

function loadEnvironment(rootDir) {
  const runtimeDir = path.join(rootDir, "runtime");
  return Object.freeze({
    port: Number(process.env.PORT) || 3000,
    host: String(process.env.HOST || "0.0.0.0"),
    dataDir: process.env.SCOREBOARD_DATA_DIR || path.join(runtimeDir, "data"),
    obsDir: process.env.SCOREBOARD_OBS_DIR || path.join(runtimeDir, "obs"),
    rulesPath: process.env.SCOREBOARD_RULES || path.join(runtimeDir, "config", "competition-rules.json"),
    clientDir: path.join(rootDir, "dist", "client"),
  });
}

module.exports = { loadEnvironment };
