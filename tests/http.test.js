"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { createApp } = require("../server/transport/http/app");

async function withServer(run) {
  const scoreboard = {
    getUpdateData() {
      return { status: "READY", resultLocked: false, teamNameA: "TEAM A", teamNameB: "TEAM B", time: "00.00" };
    },
  };
  const fieldReadiness = {
    async inspect() {
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        hostname: "test-host",
        platform: process.platform,
        node: process.version,
        uptimeSeconds: 1,
        network: [{ interface: "test", address: "192.168.1.10" }],
        disk: { data: { available: true, freeBytes: 1024, totalBytes: 2048 }, obs: { available: true, freeBytes: 1024, totalBytes: 2048 } },
        paths: { dataDir: "/runtime/data", obsDir: "/runtime/obs", rulesPath: "/runtime/config/rules", publicDir: "/dist/client" },
        broadcast: { ok: true, type: "text-files", localOnly: true, fileCount: 18, obsDir: "/runtime/obs", lastPublishedAt: null, lastFlushAt: null, lastError: null },
        clients: { total: 0, counts: {}, clients: [] },
        checks: [{ name: "data-writable", ok: true, detail: "/runtime/data" }],
      };
    },
  };
  const app = createApp({ scoreboard, fieldReadiness, publicDir: path.join(__dirname, "..", "client", "static") });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("canonical HTTP routes serve health", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.mode, "offline-lan");
    assert.equal(health.status, "READY");
  });
});

test("field status exposes central-machine and broadcast diagnostics", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/field-status`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.hostname, "test-host");
    assert.equal(data.broadcast.localOnly, true);
    assert.equal(data.scoreboard.status, "READY");

    const page = await fetch(`${baseUrl}/status`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /FIELD READINESS/);
    assert.match(html, /\/app\/status\.js/);

    const legacy = await fetch(`${baseUrl}/status.html`, { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/status");
  });
});

test("control page uses bundled typed client entry", async () => {
  await withServer(async (baseUrl) => {
    const control = await fetch(`${baseUrl}/control`);
    assert.equal(control.status, 200);
    const html = await control.text();
    assert.match(html, /\/app\/control\.js/);
    assert.doesNotMatch(html, /\sonclick=/i);

    const legacy = await fetch(`${baseUrl}/control.html`, { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/control");
  });
});

test("team pages are thin scoring clients sharing one scoring bundle", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ["/team/a", "/team/b"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /data-team="[AB]"/);
      assert.match(html, /\/app\/scoring\.js/);
      assert.doesNotMatch(html, /startTimeButton|stopTimeButton|resetScoreButton/);
    }
  });
});

test("team setup uses its explicit client bundle", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/teams`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /\/app\/team-setup\.js/);
  });
});

test("OBS browser overlay has a dedicated local read-only client route", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/overlay/main`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /\/app\/overlay-main\.js/);
    assert.doesNotMatch(html, /startTimeButton|resetAllButton|data-score=/);

    const redirect = await fetch(`${baseUrl}/overlay`, { redirect: "manual" });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), "/overlay/main");
  });
});
