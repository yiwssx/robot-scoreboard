"use strict";

const http = require("node:http");
const { Server } = require("socket.io");
const { loadEnvironment } = require("./src/config/env");
const { loadCompetitionRules } = require("./src/config/competition-rules");
const { createScoreboard } = require("./src/services/scoreboard.service");
const { createFieldReadiness } = require("./src/infrastructure/diagnostics/field-readiness");
const { createApp } = require("./src/http/app");
const { registerSockets } = require("./src/sockets");

const env = loadEnvironment(__dirname);
const rules = loadCompetitionRules(env.rulesPath);

let io = null;
const scoreboard = createScoreboard({
  dataDir: env.dataDir,
  obsDir: env.obsDir,
  rules,
  onUpdate: (data) => {
    if (io) io.emit("update", data);
  },
});

const fieldReadiness = createFieldReadiness({
  dataDir: env.dataDir,
  obsDir: env.obsDir,
  rulesPath: env.rulesPath,
  publicDir: env.publicDir,
});
const app = createApp({ scoreboard, publicDir: env.publicDir, fieldReadiness });
const server = http.createServer(app);
io = new Server(server);
registerSockets(io, scoreboard);

async function bootstrap() {
  await scoreboard.initialize();
  server.listen(env.port, env.host, () => {
    console.log(`Robot Scoreboard running on http://${env.host}:${env.port}`);
    console.log("Mode: offline / trusted LAN (no authentication)");
    console.log(`Rules: ${env.rulesPath}`);
    console.log(`Field status: http://localhost:${env.port}/status`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; pausing and saving scoreboard state...`);
  await scoreboard.shutdown({ page: "server", socketId: signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error) => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
