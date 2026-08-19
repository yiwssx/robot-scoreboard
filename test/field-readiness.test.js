"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createFieldReadiness } = require("../src/infrastructure/diagnostics/field-readiness");

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "field-readiness-"));
  const dataDir = path.join(root, "data");
  const obsDir = path.join(root, "obs");
  const publicDir = path.join(root, "public");
  const rulesPath = path.join(root, "config", "competition-rules.json");
  await fs.mkdir(path.dirname(rulesPath), { recursive: true });
  await fs.mkdir(path.join(publicDir, "pages"), { recursive: true });
  await fs.writeFile(rulesPath, JSON.stringify({ matchDurationSeconds: 180 }), "utf8");
  for (const name of ["control.html", "team-a.html", "team-b.html", "team-names.html"]) {
    await fs.writeFile(path.join(publicDir, "pages", name), "<!doctype html>", "utf8");
  }
  return { root, dataDir, obsDir, publicDir, rulesPath };
}

test("field readiness validates writable runtime paths and required files", async () => {
  const item = await fixture();
  try {
    const readiness = createFieldReadiness(item);
    const result = await readiness.inspect();
    assert.equal(result.ok, true);
    assert.equal(result.checks.every((check) => check.ok), true);
    assert.equal(result.paths.dataDir, item.dataDir);
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
