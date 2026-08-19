"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { createApp } = require("../src/http/app");

async function withServer(run) {
  const scoreboard = {
    getUpdateData() {
      return {
        status: "READY",
        resultLocked: false,
        teamNameA: "TEAM A",
        teamNameB: "TEAM B",
        time: "00.00",
      };
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
        disk: {
          data: { available: true, freeBytes: 1024, totalBytes: 2048 },
          obs: { available: true, freeBytes: 1024, totalBytes: 2048 },
        },
        paths: { dataDir: "/data", obsDir: "/obs", rulesPath: "/rules", publicDir: "/public" },
        checks: [{ name: "data-writable", ok: true, detail: "/data" }],
      };
    },
  };
  const app = createApp({
    scoreboard,
    fieldReadiness,
    publicDir: path.join(__dirname, "..", "public"),
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("canonical HTTP routes serve organized pages and health", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.equal(health.ok, true);
    assert.equal(health.mode, "offline-lan");
    assert.equal(health.status, "READY");
    assert.equal(health.resultLocked, false);
    assert.equal(Number.isInteger(health.uptimeSeconds), true);
    assert.equal(health.uptimeSeconds >= 0, true);
  });
});

test("field status exposes machine readiness and scoreboard state", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/field-status`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.hostname, "test-host");
    assert.equal(data.scoreboard.status, "READY");
    assert.equal(data.scoreboard.teamNameA, "TEAM A");
    assert.equal(data.checks[0].name, "data-writable");

    const page = await fetch(`${baseUrl}/status`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /FIELD READINESS/);
    assert.match(html, /\/js\/pages\/status\.js/);

    const legacy = await fetch(`${baseUrl}/status.html`, { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/status");
  });
});

test("control page uses clean routes and external page modules", async () => {
  await withServer(async (baseUrl) => {
    const control = await fetch(`${baseUrl}/control`);
    assert.equal(control.status, 200);
    const html = await control.text();
    assert.match(html, /\/js\/pages\/control\.js/);
    assert.match(html, /\/js\/common\/notifications\.js/);
    assert.match(html, /\/js\/pages\/control-actions\.js/);
    assert.match(html, /\/js\/pages\/control-safety\.js/);
    assert.doesNotMatch(html, /\sonclick=/i);
    assert.doesNotMatch(html, /field-safety\.js/);

    const legacy = await fetch(`${baseUrl}/control.html`, { redirect: "manual" });
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get("location"), "/control");

    const css = await fetch(`${baseUrl}/css/brand.css`);
    assert.equal(css.status, 200);
  });
});

test("team pages are statically scoring-only and share one controller", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ["/team/a", "/team/b"]) {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /data-team="[AB]"/);
      assert.match(html, /\/js\/pages\/team-score\.js/);
      assert.match(html, /\/js\/common\/notifications\.js/);
      assert.doesNotMatch(html, /startTimeButton|stopTimeButton|resetScoreButton/);
      assert.doesNotMatch(html, /team-[ab]\.js/);
    }
  });
});
