"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

class EventLog {
  constructor(dataDir, fileName = "event-log.ndjson") {
    this.filePath = path.join(dataDir, fileName);
    this.chain = Promise.resolve();
    this.lastError = null;
  }

  append(entry) {
    const line = `${JSON.stringify(entry)}\n`;
    this.chain = this.chain
      .then(async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.appendFile(this.filePath, line, "utf8");
        this.lastError = null;
      })
      .catch((error) => {
        this.lastError = error;
        console.error("Event log write failed:", error);
      });
    return this.chain;
  }

  async flush() {
    await this.chain;
    if (this.lastError) throw this.lastError;
  }
}

module.exports = { EventLog };
