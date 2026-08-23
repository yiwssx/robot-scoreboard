"use strict";

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");

const RETRYABLE_FS_CODES = new Set(["EBUSY", "EPERM", "EACCES", "EEXIST"]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AtomicWriteQueue {
  constructor({ debounceMs = 50, maxWriteRetries = 6, onError = () => {}, onFlush = () => {} } = {}) {
    this.debounceMs = debounceMs;
    this.maxWriteRetries = maxWriteRetries;
    this.onError = onError;
    this.onFlush = onFlush;
    this.pendingWrites = new Map();
    this.writeTimer = null;
    this.writeChain = Promise.resolve();
    this.lastError = null;
  }

  queue(filePath, content) {
    this.pendingWrites.set(filePath, String(content));
    if (this.writeTimer === null) {
      this.writeTimer = setTimeout(() => {
        this.writeTimer = null;
        void this.flushPendingWrites();
      }, this.debounceMs);
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
      .then(() => {
        this.lastError = null;
        this.onFlush({ count: batch.length, at: new Date().toISOString() });
      })
      .catch((error) => {
        this.lastError = error;
        this.onError(error);
      });

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
    if (this.lastError) throw this.lastError;
  }
}

module.exports = { AtomicWriteQueue, RETRYABLE_FS_CODES };
