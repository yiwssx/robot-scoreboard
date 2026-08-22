"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { AtomicWriteQueue } = require("../../storage/fs/atomic-write-queue");

function textFilesFromBroadcast(snapshot) {
  const files = {
    "score_a.txt": snapshot.teamA.score,
    "score_b.txt": snapshot.teamB.score,
    "time.txt": snapshot.match.time,
    "shot_a.txt": snapshot.teamA.shot,
    "shot_b.txt": snapshot.teamB.shot,
    "status.txt": snapshot.match.status,
    "team-name-a.text": snapshot.teamA.visible ? snapshot.teamA.name : "",
    "team-name-b.text": snapshot.teamB.visible ? snapshot.teamB.name : "",
    "nameschool-a.text": snapshot.teamA.visible ? snapshot.teamA.school : "",
    "nameschool-b.text": snapshot.teamB.visible ? snapshot.teamB.school : "",
  };
  snapshot.teamA.missions.forEach((value, index) => { files[`mission_shot_a_${index + 1}.txt`] = value; });
  snapshot.teamB.missions.forEach((value, index) => { files[`mission_shot_b_${index + 1}.txt`] = value; });
  return files;
}

class TextFileBroadcastOutput {
  constructor({ obsDir, debounceMs = 50, maxWriteRetries = 6 }) {
    this.obsDir = obsDir;
    this.lastValues = new Map();
    this.lastError = null;
    this.lastFlushAt = null;
    this.lastPublishedAt = null;
    this.fileCount = 0;
    this.queue = new AtomicWriteQueue({
      debounceMs,
      maxWriteRetries,
      onError: (error) => {
        this.lastError = { message: error.message, code: error.code || "UNKNOWN", at: new Date().toISOString() };
        console.error("Broadcast text output failed:", error);
      },
      onFlush: ({ at }) => {
        this.lastError = null;
        this.lastFlushAt = at;
      },
    });
  }

  async ensureDirectory() { await fs.mkdir(this.obsDir, { recursive: true }); }

  publish(snapshot, force = false) {
    const files = textFilesFromBroadcast(snapshot);
    this.fileCount = Object.keys(files).length;
    this.lastPublishedAt = new Date().toISOString();
    for (const [fileName, value] of Object.entries(files)) {
      const content = String(value ?? "");
      if (!force && this.lastValues.get(fileName) === content) continue;
      this.lastValues.set(fileName, content);
      this.queue.queue(path.join(this.obsDir, fileName), content);
    }
  }

  flushAll() { return this.queue.flushAll(); }

  health() {
    return {
      type: "text-files", localOnly: true, obsDir: this.obsDir, fileCount: this.fileCount,
      lastPublishedAt: this.lastPublishedAt, lastFlushAt: this.lastFlushAt,
      lastError: this.lastError, ok: !this.lastError,
    };
  }
}

module.exports = { TextFileBroadcastOutput, textFilesFromBroadcast };
