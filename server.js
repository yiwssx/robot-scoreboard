"use strict";

const express = require("express");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Server } = require("socket.io");
const { createScoreboard } = require("./src/scoreboard");
const { registerSocketHandlers } = require("./src/socket-handlers");
const { loadCompetitionRules } = require("./src/rules");

const PORT = Number(process.env.PORT) || 3000;
const HOST = String(process.env.HOST || "0.0.0.0");
const DATA_DIR = process.env.SCOREBOARD_DATA_DIR || path.join(__dirname, "data");
const OBS_DIR = process.env.SCOREBOARD_OBS_DIR || path.join(__dirname, "obs");
const RULES_PATH = process.env.SCOREBOARD_RULES || path.join(__dirname, "config", "competition-rules.json");
const SAFE_HTML_PAGES = new Set(["/control.html", "/team-a.html", "/team-b.html", "/team-names.html"]);

const rules = loadCompetitionRules(RULES_PATH);
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
  rules,
  onUpdate: (data) => io.emit("update", data),
});

app.get("/healthz", (req, res) => {
  const data = scoreboard.getUpdateData();
  res.json({
    ok: true,
    mode: "offline-lan",
    status: data.status,
    resultLocked: data.resultLocked,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.get("/", (req, res) => res.redirect("/control.html"));

// Keep the original HTML files intact while injecting the field-safety layer.
app.get(Array.from(SAFE_HTML_PAGES), async (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "public", path.basename(req.path));
    let html = await fs.readFile(filePath, "utf8");
    html = html.replace(/<\/body>/i, '<script src="/field-safety.js"></script></body>');
    res.type("html").send(html);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, "public")));
registerSocketHandlers(io, scoreboard);

async function bootstrap() {
  await scoreboard.initialize();
  server.listen(PORT, HOST, () => {
    console.log(`Robot Scoreboard running on http://${HOST}:${PORT}`);
    console.log("Mode: offline / trusted LAN (no authentication)");
    console.log(`Rules: ${RULES_PATH}`);
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
