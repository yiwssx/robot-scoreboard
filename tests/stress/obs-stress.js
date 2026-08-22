"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Persistence } = require("../../server/storage/persistence/file-store");
const { TextFileBroadcastOutput } = require("../../server/broadcast/outputs/text-file-output");

function snapshot(i) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    match: { status: i % 2 ? "RUNNING" : "PAUSED", time: `00.${String(i % 60).padStart(2, "0")}`, timeElapsed: i, remainingSeconds: Math.max(180 - i, 0), matchDuration: 180 },
    teamA: { name: "TEAM A", school: "A SCHOOL", score: i, shot: "", missions: ["", "", "", ""], visible: true },
    teamB: { name: "TEAM B", school: "B SCHOOL", score: 1500 - i, shot: "", missions: ["", "", "", ""], visible: true },
    result: { winner: null, winnerName: "", locked: false },
  };
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "robot-scoreboard-obs-stress-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");
  const persistence = new Persistence({ dataDir, legacyObsDir: obsDir, debounceMs: 0, maxWriteRetries: 8 });
  const broadcast = new TextFileBroadcastOutput({ obsDir, debounceMs: 0, maxWriteRetries: 8 });
  await Promise.all([persistence.ensureDirectories(), broadcast.ensureDirectory()]);

  let keepReading = true;
  let readErrors = 0;
  const readers = Array.from({ length: 4 }, async () => {
    while (keepReading) {
      try { await fs.readFile(path.join(obsDir, "time.txt"), "utf8"); }
      catch (error) { if (error.code !== "ENOENT") readErrors += 1; }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });

  for (let i = 0; i < 1500; i += 1) {
    broadcast.publish(snapshot(i));
    persistence.queueJson("live-match-state.json", { i, at: Date.now() });
    if (i % 25 === 0) await Promise.all([broadcast.flushAll(), persistence.flushAll()]);
  }

  await Promise.all([broadcast.flushAll(), persistence.flushAll()]);
  keepReading = false;
  await Promise.all(readers);

  const finalA = await fs.readFile(path.join(obsDir, "score_a.txt"), "utf8");
  const state = JSON.parse(await fs.readFile(path.join(dataDir, "live-match-state.json"), "utf8"));
  const health = broadcast.health();
  if (finalA !== "1499" || state.i !== 1499 || readErrors !== 0 || !health.ok) {
    throw new Error(`stress validation failed: finalA=${finalA}, state=${state.i}, readErrors=${readErrors}, broadcastOk=${health.ok}`);
  }

  await fs.rm(root, { recursive: true, force: true });
  console.log("OBS broadcast stress test passed (1500 updates, concurrent readers, separate persistence queue)." );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
