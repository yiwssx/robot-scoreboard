"use strict";

const path = require("node:path");

function loadEnvironment(rootDir) {
  return Object.freeze({
    port: Number(process.env.PORT) || 3000,
    host: String(process.env.HOST || "0.0.0.0"),
    dataDir: process.env.SCOREBOARD_DATA_DIR || path.join(rootDir, "data"),
    obsDir: process.env.SCOREBOARD_OBS_DIR || path.join(rootDir, "obs"),
    rulesPath: process.env.SCOREBOARD_RULES || path.join(rootDir, "config", "competition-rules.json"),
    publicDir: path.join(rootDir, "public"),
  });
}

module.exports = { loadEnvironment };
