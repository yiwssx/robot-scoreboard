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

async function checkPage(publicDir, relativePath) {
  const filePath = path.join(publicDir, relativePath);
  try {
    await fs.access(filePath);
    return { name: `page:${relativePath}`, ok: true, detail: filePath };
  } catch (error) {
    return { name: `page:${relativePath}`, ok: false, detail: `${filePath}: ${error.message}` };
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

function createFieldReadiness({ dataDir, obsDir, rulesPath, publicDir }) {
  async function inspect() {
    const checks = await Promise.all([
      checkWritableDirectory("data-writable", dataDir),
      checkWritableDirectory("obs-writable", obsDir),
      checkJsonFile("competition-rules", rulesPath),
      checkPage(publicDir, path.join("pages", "control.html")),
      checkPage(publicDir, path.join("pages", "team-a.html")),
      checkPage(publicDir, path.join("pages", "team-b.html")),
      checkPage(publicDir, path.join("pages", "team-names.html")),
    ]);

    return {
      ok: checks.every((check) => check.ok),
      checkedAt: new Date().toISOString(),
      hostname: os.hostname(),
      platform: process.platform,
      node: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      network: lanAddresses(),
      disk: {
        data: await diskInfo(dataDir),
        obs: await diskInfo(obsDir),
      },
      paths: { dataDir, obsDir, rulesPath, publicDir },
      checks,
    };
  }

  return { inspect };
}

module.exports = { createFieldReadiness };
