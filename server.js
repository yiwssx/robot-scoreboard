"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { createScoreboard } = require("./src/scoreboard");
const { registerSocketHandlers } = require("./src/socket-handlers");

const PORT = Number(process.env.PORT) || 3000;
const HOST = String(process.env.HOST || "0.0.0.0");
const DATA_DIR = process.env.SCOREBOARD_DATA_DIR || path.join(__dirname, "data");
const OBS_DIR = process.env.SCOREBOARD_OBS_DIR || path.join(__dirname, "obs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (/\.(?:html|css|js)$/i.test(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

const scoreboard = createScoreboard({
  dataDir: DATA_DIR,
  obsDir: OBS_DIR,
  onUpdate: (data) => io.emit("update", data),
});

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    mode: "offline-lan",
    status: scoreboard.getUpdateData().status,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.use(express.static("public"));
registerSocketHandlers(io, scoreboard);

async function bootstrap() {
  await scoreboard.initialize();
  server.listen(PORT, HOST, () => {
    console.log(`Robot Scoreboard running on ${HOST}:${PORT}`);
    console.log("Mode: offline / trusted LAN (no authentication)");
  });
}

async function shutdown(signal) {
  console.log(`Received ${signal}; saving scoreboard state...`);
  await scoreboard.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error) => {
  console.error("Server bootstrap failed:", error);
  process.exit(1);
});
