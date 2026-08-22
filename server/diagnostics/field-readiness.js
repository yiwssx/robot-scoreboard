"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

async function checkWritableDirectory(name, directory) {
  const probe = path.join(directory, `.field-check-${process.pid}-${Date.now()}.tmp`);
  try {
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return { name, ok: true, detail: directory };
  } catch (error) {
    try { await fs.unlink(probe); } catch {}
    return { name, ok: false, detail: `${directory}: ${error.message}` };
  }
}

async function checkJsonFile(name, filePath) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    return { name, ok: Boolean(value && typeof value === "object"), detail: filePath };
  } catch (error) {
    return { name, ok: false, detail: `${filePath}: ${error.message}` };
  }
}

async function checkAsset(publicDir, relativePath) {
  const filePath = path.join(publicDir, relativePath);
  try {
    await fs.access(filePath);
    return { name: `asset:${relativePath.replaceAll("\\", "/")}`, ok: true, detail: filePath };
  } catch (error) {
    return { name: `asset:${relativePath.replaceAll("\\", "/")}`, ok: false, detail: `${filePath}: ${error.message}` };
  }
}

async function diskInfo(directory) {
  try {
    const stat = await fs.statfs(directory);
    const freeBytes = Number(stat.bavail) * Number(stat.bsize);
    const totalBytes = Number(stat.blocks) * Number(stat.bsize);
    return { available: true, freeBytes, totalBytes };
  } catch {
    return { available: false, freeBytes: null, totalBytes: null };
  }
}

function lanAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      addresses.push({ interface: name, address: entry.address });
    }
  }
  return addresses;
}

const REQUIRED_PUBLIC_ASSETS = Object.freeze([
  path.join("pages", "control.html"),
  path.join("pages", "team-a.html"),
  path.join("pages", "team-b.html"),
  path.join("pages", "team-names.html"),
  path.join("pages", "status.html"),
  path.join("pages", "overlay-main.html"),
  path.join("app", "control.js"),
  path.join("app", "scoring.js"),
  path.join("app", "team-setup.js"),
  path.join("app", "status.js"),
  path.join("app", "overlay-main.js"),
]);

function createFieldReadiness({ dataDir, obsDir, rulesPath, publicDir, getClientSummary = null, getBroadcastHealth = null }) {
  async function inspect() {
    const broadcast = typeof getBroadcastHealth === "function" ? getBroadcastHealth() : null;
    const checks = await Promise.all([
      checkWritableDirectory("data-writable", dataDir),
      checkWritableDirectory("obs-writable", obsDir),
      checkJsonFile("competition-rules", rulesPath),
      ...REQUIRED_PUBLIC_ASSETS.map((relativePath) => checkAsset(publicDir, relativePath)),
    ]);

    if (broadcast) {
      checks.push({
        name: "broadcast-text-output",
        ok: Boolean(broadcast.ok),
        detail: broadcast.ok ? `${broadcast.fileCount || 0} local OBS text outputs ready` : String(broadcast.lastError && broadcast.lastError.message || "broadcast output error"),
      });
    }

    return {
      ok: checks.every((check) => check.ok),
      checkedAt: new Date().toISOString(),
      hostname: os.hostname(),
      platform: process.platform,
      node: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      network: lanAddresses(),
      disk: { data: await diskInfo(dataDir), obs: await diskInfo(obsDir) },
      paths: { dataDir, obsDir, rulesPath, publicDir },
      broadcast,
      clients: typeof getClientSummary === "function" ? getClientSummary() : { total: 0, counts: {}, clients: [] },
      checks,
    };
  }

  return { inspect };
}

module.exports = { createFieldReadiness, REQUIRED_PUBLIC_ASSETS };
