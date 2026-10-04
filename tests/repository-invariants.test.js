"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("dependency automation keeps routine updates direct while allowing a narrow security exception", () => {
  const dependabot = read(".github/dependabot.yml");
  assert.match(dependabot, /package-ecosystem:\s*"npm"/);
  assert.match(dependabot, /dependency-type:\s*"direct"/);
  assert.match(dependabot, /versioning-strategy:\s*"increase"/);
  assert.doesNotMatch(dependabot, /package-ecosystem:\s*"github-actions"/);

  const policy = read(".github/workflows/dependabot-policy.yml");
  assert.match(policy, /PACKAGE_ECOSYSTEM/);
  assert.match(policy, /PACKAGE_ECOSYSTEM" != "npm"/);
  assert.match(policy, /npm_and_yarn/);
  assert.match(policy, /grep -Fxq 'package\.json'/);
  assert.match(policy, /DEPENDENCY_TYPE/);
  assert.match(policy, /indirect\)/);
  assert.match(policy, /CHANGED_FILES" != "package-lock\.json"/);
  assert.match(policy, /dependency-security/);
  assert.match(policy, /dependency-indirect-blocked/);
  assert.match(policy, /dependency-policy-blocked/);
  assert.doesNotMatch(
    policy,
    /--remove-label "dependency-hold"/,
    "classification must never clear a manual field-freeze hold",
  );

  const automerge = read(".github/workflows/dependabot-automerge.yml");
  assert.match(automerge, /dependency-direct/);
  assert.match(automerge, /dependency-security/);
  assert.match(automerge, /dependency-policy-blocked/);
  assert.match(automerge, /dependency-indirect-blocked/);
  assert.match(automerge, /dependency-hold/);
});

test("CI keeps dependency review and current action runtimes", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /actions\/dependency-review-action@v5/);
  assert.match(workflow, /fail-on-severity:\s*high/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
});

test("CodeQL security analysis remains enabled for application code", () => {
  const workflow = read(".github/workflows/security-quality.yml");
  assert.match(workflow, /security-events:\s*write/);
  assert.match(workflow, /github\/codeql-action\/init@v4/);
  assert.match(workflow, /github\/codeql-action\/analyze@v4/);
  assert.match(workflow, /languages:\s*javascript-typescript/);
  assert.match(workflow, /github\.actor != 'dependabot\[bot\]'/);
});

test("filesystem-backed page routes remain rate-limited", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.dependencies["express-rate-limit"], "^8.7.0");

  const routes = read("server/transport/http/routes/pages.routes.js");
  assert.match(routes, /require\("express-rate-limit"\)/);
  assert.match(routes, /rateLimit\(/);
  assert.match(routes, /limit:\s*600/);
  for (const route of ["/control", "/team/a", "/team/b", "/teams", "/status", "/overlay/main"]) {
    const escaped = route.replaceAll("/", "\\/");
    assert.match(routes, new RegExp(`router\\.get\\(\\"${escaped}\\",\\s*pageRateLimiter,`));
  }
});

test("repository publishes a private vulnerability reporting policy", () => {
  const policy = read(".github/SECURITY.md");
  assert.match(policy, /GitHub Security Advisories/);
  assert.match(policy, /Do not open a public issue/i);
  assert.match(policy, /within 7 days/i);
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
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /persist-credentials:\s*false/);
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
