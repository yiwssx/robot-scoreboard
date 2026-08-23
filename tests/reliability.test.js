"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AtomicWriteQueue } = require("../server/storage/fs/atomic-write-queue");
const { EventLog } = require("../server/storage/logging/event-log");
const { TextFileBroadcastOutput } = require("../server/broadcast/outputs/text-file-output");

function broadcastSnapshot() {
  return {
    match: { time: "00.00", status: "READY" },
    teamA: { score: 0, shot: "--.--", visible: true, name: "A", school: "School A", missions: ["", "", "", ""] },
    teamB: { score: 0, shot: "--.--", visible: true, name: "B", school: "School B", missions: ["", "", "", ""] },
  };
}

test("atomic flush surfaces a failed write and recovers after a later successful batch", async () => {
  const queue = new AtomicWriteQueue({ debounceMs: 0 });
  queue.atomicWrite = async () => { throw new Error("forced write failure"); };
  queue.queue("ignored", "one");
  await assert.rejects(queue.flushAll(), /forced write failure/);

  queue.atomicWrite = async () => {};
  queue.queue("ignored", "two");
  await queue.flushAll();
});

test("event log flush surfaces append failure and can recover", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scoreboard-event-log-"));
  try {
    const log = new EventLog(root);
    log.filePath = root;
    await log.append({ event: "FAIL" });
    await assert.rejects(log.flush());

    log.filePath = path.join(root, "event-log.ndjson");
    await log.append({ event: "RECOVER" });
    await log.flush();
    assert.match(await fs.readFile(log.filePath, "utf8"), /RECOVER/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("OBS changed-only cache is invalidated after a failed write batch", () => {
  const output = new TextFileBroadcastOutput({ obsDir: "ignored" });
  const queued = [];
  output.queue.queue = (filePath, content) => queued.push([filePath, content]);

  const snapshot = broadcastSnapshot();
  output.publish(snapshot);
  const firstCount = queued.length;
  assert.equal(firstCount > 0, true);

  output.queue.onError(new Error("forced OBS failure"));
  queued.length = 0;
  output.publish(snapshot);
  assert.equal(queued.length, firstCount);
});
