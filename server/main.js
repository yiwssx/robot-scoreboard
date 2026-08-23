"use strict";

const http = require("node:http");
const path = require("node:path");
const { Server } = require("socket.io");
const { loadEnvironment } = require("./config/env");
const { migrateLegacyLayout } = require("./config/legacy-layout");
const { loadCompetitionRules } = require("./config/competition-rules");
const { createScoreboard } = require("./competition/use-cases/scoreboard.service");
const { createFieldReadiness } = require("./diagnostics/field-readiness");
const { createApp } = require("./transport/http/app");
const { registerSockets } = require("./transport/sockets");
const { createClientRegistry } = require("./transport/sockets/client-registry");

const projectRoot = path.resolve(__dirname, "..");
const env = loadEnvironment(projectRoot);
const migration = migrateLegacyLayout(projectRoot, env);
if (migration.migrated.length > 0) {
  console.log(`Migrated legacy field layout into runtime/: ${migration.migrated.join(", ")}`);
}
const rules = loadCompetitionRules(env.rulesPath);
const clientRegistry = createClientRegistry();

let io = null;
let broadcastNamespace = null;
const scoreboard = createScoreboard({
  dataDir: env.dataDir,
  obsDir: env.obsDir,
  rules,
  onUpdate: (data, broadcast) => {
    if (io) io.emit("update", data);
    if (broadcastNamespace) broadcastNamespace.emit("broadcast:update", broadcast);
  },
});

const fieldReadiness = createFieldReadiness({
  dataDir: env.dataDir,
  obsDir: env.obsDir,
  rulesPath: env.rulesPath,
  publicDir: env.clientDir,
  getClientSummary: clientRegistry.summary,
  getBroadcastHealth: scoreboard.getBroadcastHealth,
});
const app = createApp({ scoreboard, publicDir: env.clientDir, fieldReadiness });
const server = http.createServer(app);
io = new Server(server);
({ broadcastNamespace } = registerSockets(io, scoreboard, clientRegistry));

async function bootstrap() {
  await scoreboard.initialize();
  server.listen(env.port, env.host, () => {
    console.log(`Robot Scoreboard running on http://${env.host}:${env.port}`);
    console.log("Mode: offline / trusted LAN (no authentication)");
    console.log("Broadcast/OBS: central machine only; text output uses local filesystem");
    console.log(`Rules: ${env.rulesPath}`);
    console.log(`Field status: http://localhost:${env.port}/status`);
    console.log(`OBS browser overlay: http://127.0.0.1:${env.port}/overlay/main`);
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; pausing and saving scoreboard state...`);
  let exitCode = 0;
  try {
    await scoreboard.shutdown({ page: "server", socketId: signal });
  } catch (error) {
    exitCode = 1;
    console.error("Scoreboard shutdown persistence failed:", error);
  }
  server.close(() => process.exit(exitCode));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error) => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
