"use strict";

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");

const RETRYABLE_FS_CODES = new Set(["EBUSY", "EPERM", "EACCES", "EEXIST"]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Persistence {
  constructor({ dataDir, obsDir, debounceMs = 50, maxWriteRetries = 6 }) {
    this.dataDir = dataDir;
    this.obsDir = obsDir;
    this.debounceMs = debounceMs;
    this.maxWriteRetries = maxWriteRetries;
    this.pendingWrites = new Map();
    this.lastObsValues = new Map();
    this.writeTimer = null;
    this.writeChain = Promise.resolve();
  }

  async ensureDirectories() {
    await Promise.all([
      fsp.mkdir(this.dataDir, { recursive: true }),
      fsp.mkdir(this.obsDir, { recursive: true }),
    ]);
  }

  dataPath(fileName) {
    return path.join(this.dataDir, fileName);
  }

  obsPath(fileName) {
    return path.join(this.obsDir, fileName);
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
    return this.readJson(this.obsPath(legacyObsFileName), fallback);
  }

  async readLegacyText(fileName) {
    try {
      return await fsp.readFile(this.obsPath(fileName), "utf8");
    } catch {
      return "";
    }
  }

  queueWrite(filePath, content) {
    this.pendingWrites.set(filePath, String(content));
    if (this.writeTimer === null) {
      this.writeTimer = setTimeout(() => {
        this.writeTimer = null;
        void this.flushPendingWrites();
      }, this.debounceMs);
    }
  }

  queueJson(fileName, data) {
    this.queueWrite(this.dataPath(fileName), `${JSON.stringify(data, null, 2)}\n`);
  }

  queueObs(values, force = false) {
    for (const [fileName, value] of Object.entries(values)) {
      const content = String(value);
      if (!force && this.lastObsValues.get(fileName) === content) continue;
      this.lastObsValues.set(fileName, content);
      this.queueWrite(this.obsPath(fileName), content);
    }
  }

  async atomicWrite(filePath, content) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    await fsp.writeFile(tempPath, content, "utf8");

    let lastError = null;
    for (let attempt = 0; attempt <= this.maxWriteRetries; attempt += 1) {
      try {
        await fsp.rename(tempPath, filePath);
        return;
      } catch (error) {
        lastError = error;
        if (!RETRYABLE_FS_CODES.has(error.code) || attempt === this.maxWriteRetries) break;
        await delay(Math.min(15 * (2 ** attempt), 250));
      }
    }

    // Windows/antivirus/OBS readers can very briefly block replacement. As a last
    // resort, remove the previous file and move the complete temp file into place.
    if (lastError && RETRYABLE_FS_CODES.has(lastError.code)) {
      try {
        await fsp.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") throw lastError;
      }
      await fsp.rename(tempPath, filePath);
      return;
    }

    try { await fsp.unlink(tempPath); } catch {}
    throw lastError;
  }

  flushPendingWrites() {
    if (this.pendingWrites.size === 0) return this.writeChain;
    const batch = Array.from(this.pendingWrites.entries());
    this.pendingWrites.clear();

    this.writeChain = this.writeChain
      .then(() => Promise.all(batch.map(([filePath, content]) => this.atomicWrite(filePath, content))))
      .catch((error) => console.error("Persistence write failed:", error));

    if (this.pendingWrites.size > 0 && this.writeTimer === null) {
      this.writeTimer = setTimeout(() => {
        this.writeTimer = null;
        void this.flushPendingWrites();
      }, this.debounceMs);
    }
    return this.writeChain;
  }

  async flushAll() {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    while (this.pendingWrites.size > 0) await this.flushPendingWrites();
    await this.writeChain;
  }
}

module.exports = { Persistence, RETRYABLE_FS_CODES };
