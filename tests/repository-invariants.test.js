"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("dependency automation is limited to direct package.json npm dependencies", () => {
  const dependabot = read(".github/dependabot.yml");
  assert.match(dependabot, /package-ecosystem:\s*"npm"/);
  assert.match(dependabot, /dependency-type:\s*"direct"/);
  assert.match(dependabot, /versioning-strategy:\s*"increase"/);
  assert.doesNotMatch(dependabot, /package-ecosystem:\s*"github-actions"/);

  const policy = read(".github/workflows/dependabot-policy.yml");
  assert.match(policy, /PACKAGE_ECOSYSTEM/);
  assert.match(policy, /PACKAGE_ECOSYSTEM" != "npm"/);
  assert.match(policy, /grep -Fxq 'package\.json'/);
  assert.match(policy, /dependency-indirect-blocked/);
  assert.match(policy, /dependency-policy-blocked/);

  const automerge = read(".github/workflows/dependabot-automerge.yml");
  assert.match(automerge, /dependency-direct/);
  assert.match(automerge, /dependency-policy-blocked/);
  assert.match(automerge, /dependency-indirect-blocked/);
});

test("offline release workflow cannot bypass critical field validation gates", () => {
  const workflow = read(".github/workflows/release-offline.yml");
  for (const required of [
    "npm run build:client",
    "npm run check",
    "npm test",
    "npm run stress:obs",
    "tools/field/field-check.ps1",
    "tests/field/backup-restore.ps1",
    "npm audit --audit-level=high",
    "tools/release/verify-offline-package.ps1",
  ]) {
    assert.ok(workflow.includes(required), `release workflow missing gate: ${required}`);
  }
  assert.match(workflow, /github\.ref_type == 'tag'/);
  assert.match(workflow, /package\.json version/);
});

test("offline process control is scoped to the managed scoreboard process", () => {
  const buildScript = read("tools/release/build-offline-windows.ps1");
  assert.match(buildScript, /scoreboard\.pid\.json/);
  assert.match(buildScript, /START-SCOREBOARD\.ps1/);
  assert.match(buildScript, /STOP-SCOREBOARD\.ps1/);
  assert.match(buildScript, /Get-CimInstance Win32_Process/);
  assert.doesNotMatch(buildScript, /taskkill\s+\/PID/i);
  assert.doesNotMatch(buildScript, /netstat\s+-ano/i);

  const verifier = read("tools/release/verify-offline-package.ps1");
  assert.match(verifier, /START-SCOREBOARD\.ps1/);
  assert.match(verifier, /STOP-SCOREBOARD\.ps1/);
  assert.match(verifier, /api\/field-status/);
  assert.match(verifier, /node_modules\\express/);
  assert.match(verifier, /node_modules\\socket\.io/);
});

test("restore guard follows managed PID state and configurable PORT", () => {
  const restore = read("tools/field/restore-scoreboard.ps1");
  assert.match(restore, /scoreboard\.pid\.json/);
  assert.match(restore, /\$env:PORT/);
  assert.match(restore, /-LocalPort \$Port/);
  assert.doesNotMatch(restore, /-LocalPort 3000/);
});
