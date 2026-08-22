"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFieldReadiness, REQUIRED_PUBLIC_ASSETS } = require("../src/infrastructure/diagnostics/field-readiness");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "field-readiness-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");
  const publicDir = path.join(root, "public");
  const rulesPath = path.join(root, "config", "competition-rules.json");
  await fs.mkdir(path.dirname(rulesPath), { recursive: true });
  await fs.writeFile(rulesPath, JSON.stringify({ matchDurationSeconds: 180 }), "utf8");
  for (const relative of REQUIRED_PUBLIC_ASSETS) {
    const filePath = path.join(publicDir, relative);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, relative.endsWith(".html") ? "<!doctype html>" : "export {};", "utf8");
  }
  return { root, dataDir, obsDir, publicDir, rulesPath };
}

test("field readiness validates runtime paths, built frontend, broadcast and required pages", async () => {
  const item = await fixture();
  try {
    const readiness = createFieldReadiness({
      ...item,
      getClientSummary: () => ({ total: 2, counts: { "team-a": 1, "team-b": 1 }, clients: [] }),
      getBroadcastHealth: () => ({ ok: true, fileCount: 18, obsDir: item.obsDir, lastError: null }),
    });
    const result = await readiness.inspect();
    assert.equal(result.ok, true);
    assert.equal(result.checks.every((check) => check.ok), true);
    assert.equal(result.paths.dataDir, item.dataDir);
    assert.equal(result.clients.counts["team-a"], 1);
    assert.equal(result.broadcast.fileCount, 18);
    assert.equal(Array.isArray(result.network), true);
    assert.equal(typeof result.disk.data.available, "boolean");
  } finally {
    await fs.rm(item.root, { recursive: true, force: true });
  }
});

test("field readiness reports invalid competition rules as failure", async () => {
  const item = await fixture();
  try {
    await fs.writeFile(item.rulesPath, "{broken", "utf8");
    const readiness = createFieldReadiness(item);
    const result = await readiness.inspect();
    assert.equal(result.ok, false);
    const rulesCheck = result.checks.find((check) => check.name === "competition-rules");
    assert.equal(rulesCheck.ok, false);
  } finally {
    await fs.rm(item.root, { recursive: true, force: true });
  }
});

test("field readiness fails when a compiled frontend entry is missing", async () => {
  const item = await fixture();
  try {
    await fs.rm(path.join(item.publicDir, "app", "control.js"), { force: true });
    const readiness = createFieldReadiness(item);
    const result = await readiness.inspect();
    assert.equal(result.ok, false);
    assert.equal(result.checks.some((check) => check.name === "asset:app/control.js" && !check.ok), true);
  } finally {
    await fs.rm(item.root, { recursive: true, force: true });
  }
});
