"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Persistence } = require("../src/persistence");

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "robot-scoreboard-obs-stress-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");
  const persistence = new Persistence({ dataDir, obsDir, debounceMs: 0, maxWriteRetries: 8 });
  await persistence.ensureDirectories();

  let keepReading = true;
  let readErrors = 0;
  const readers = Array.from({ length: 4 }, async () => {
    while (keepReading) {
      try {
        await fs.readFile(path.join(obsDir, "time.txt"), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") readErrors += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  });

  for (let i = 0; i < 1500; i += 1) {
    persistence.queueObs({
      "time.txt": `00.${String(i % 60).padStart(2, "0")}`,
      "score_a.txt": i,
      "score_b.txt": 1500 - i,
      "status.txt": i % 2 ? "RUNNING" : "PAUSED",
    });
    persistence.queueJson("live-match-state.json", { i, at: Date.now() });
    if (i % 25 === 0) await persistence.flushAll();
  }

  await persistence.flushAll();
  keepReading = false;
  await Promise.all(readers);

  const finalA = await fs.readFile(path.join(obsDir, "score_a.txt"), "utf8");
  const state = JSON.parse(await fs.readFile(path.join(dataDir, "live-match-state.json"), "utf8"));
  if (finalA !== "1499" || state.i !== 1499 || readErrors !== 0) {
    throw new Error(`stress validation failed: finalA=${finalA}, state=${state.i}, readErrors=${readErrors}`);
  }

  await fs.rm(root, { recursive: true, force: true });
  console.log("OBS persistence stress test passed (1500 updates, concurrent readers)." );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
