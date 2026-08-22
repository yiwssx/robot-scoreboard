"use strict";

const fsp = require("node:fs/promises");
const path = require("node:path");
const { AtomicWriteQueue, RETRYABLE_FS_CODES } = require("../fs/atomic-write-queue");

class Persistence {
  constructor({ dataDir, legacyObsDir = null, debounceMs = 50, maxWriteRetries = 6 }) {
    this.dataDir = dataDir;
    this.legacyObsDir = legacyObsDir;
    this.queue = new AtomicWriteQueue({
      debounceMs,
      maxWriteRetries,
      onError: (error) => console.error("Persistence write failed:", error),
    });
  }

  async ensureDirectories() {
    await fsp.mkdir(this.dataDir, { recursive: true });
  }

  dataPath(fileName) {
    return path.join(this.dataDir, fileName);
  }

  legacyObsPath(fileName) {
    return this.legacyObsDir ? path.join(this.legacyObsDir, fileName) : null;
  }

  async readJson(filePath, fallback) {
    try {
      return JSON.parse(await fsp.readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`Could not read ${filePath}:`, error.message);
      return fallback;
    }
  }

  async firstExistingJson(dataFileName, legacyObsFileName, fallback) {
    const primary = this.dataPath(dataFileName);
    try {
      return JSON.parse(await fsp.readFile(primary, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`Could not read ${primary}:`, error.message);
    }
    const legacyPath = this.legacyObsPath(legacyObsFileName);
    return legacyPath ? this.readJson(legacyPath, fallback) : fallback;
  }

  async readLegacyText(fileName) {
    const legacyPath = this.legacyObsPath(fileName);
    if (!legacyPath) return "";
    try {
      return await fsp.readFile(legacyPath, "utf8");
    } catch {
      return "";
    }
  }

  queueJson(fileName, data) {
    this.queue.queue(this.dataPath(fileName), `${JSON.stringify(data, null, 2)}\n`);
  }

  flushAll() {
    return this.queue.flushAll();
  }
}

module.exports = { Persistence, RETRYABLE_FS_CODES };
