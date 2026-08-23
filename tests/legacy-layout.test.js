"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { migrateLegacyLayout } = require("../server/config/legacy-layout");

function envFor(root) {
  return {
    dataDir: path.join(root, "runtime", "data"),
    obsDir: path.join(root, "runtime", "obs"),
    rulesPath: path.join(root, "runtime", "config", "competition-rules.json"),
  };
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

test("legacy root data/obs/rules are copied into an empty runtime layout without deleting sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scoreboard-legacy-layout-"));
  try {
    const env = envFor(root);
    await write(path.join(root, "data", "team-names.json"), "{\"teamNames\":[\"OLD A\",\"OLD B\"]}\n");
    await write(path.join(root, "obs", "score_a.txt"), "99");
    await write(path.join(root, "config", "competition-rules.json"), "{\"matchDurationSeconds\":123}\n");
    await write(env.rulesPath, "{\"matchDurationSeconds\":180}\n");

    const result = migrateLegacyLayout(root, env);
    assert.deepEqual(result.migrated, ["data", "obs", "rules"]);
    assert.match(await fs.readFile(path.join(env.dataDir, "team-names.json"), "utf8"), /OLD A/);
    assert.equal(await fs.readFile(path.join(env.obsDir, "score_a.txt"), "utf8"), "99");
    assert.match(await fs.readFile(env.rulesPath, "utf8"), /123/);
    assert.match(await fs.readFile(path.join(root, "data", "team-names.json"), "utf8"), /OLD A/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("legacy migration never overwrites an active runtime layout", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "scoreboard-active-runtime-"));
  try {
    const env = envFor(root);
    await write(path.join(root, "data", "team-names.json"), "legacy");
    await write(path.join(env.dataDir, "team-names.json"), "current");

    const result = migrateLegacyLayout(root, env);
    assert.equal(result.skipped, "runtime-already-active");
    assert.deepEqual(result.migrated, []);
    assert.equal(await fs.readFile(path.join(env.dataDir, "team-names.json"), "utf8"), "current");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
