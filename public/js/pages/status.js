"use strict";

const card = document.getElementById("readinessCard");
const overall = document.getElementById("overallStatus");
const checkedAt = document.getElementById("checkedAt");
const scoreboardDetails = document.getElementById("scoreboardDetails");
const machineDetails = document.getElementById("machineDetails");
const diskDetails = document.getElementById("diskDetails");
const checkList = document.getElementById("checkList");
const refreshButton = document.getElementById("refreshButton");

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit < 2 ? 0 : 1)} ${units[unit]}`;
}

function addDetail(target, label, value) {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value ?? "-";
  target.append(term, detail);
}

function render(data) {
  card.dataset.state = data.ok ? "ok" : "error";
  overall.textContent = data.ok ? "READY FOR FIELD CHECK" : "ATTENTION REQUIRED";
  checkedAt.textContent = `Checked ${new Date(data.checkedAt).toLocaleString("th-TH")}`;

  scoreboardDetails.replaceChildren();
  addDetail(scoreboardDetails, "Status", data.scoreboard && data.scoreboard.status);
  addDetail(scoreboardDetails, "Time", data.scoreboard && data.scoreboard.time);
  addDetail(scoreboardDetails, "Team A", data.scoreboard && data.scoreboard.teamNameA);
  addDetail(scoreboardDetails, "Team B", data.scoreboard && data.scoreboard.teamNameB);
  addDetail(scoreboardDetails, "Result lock", data.scoreboard && data.scoreboard.resultLocked ? "LOCKED" : "UNLOCKED");

  machineDetails.replaceChildren();
  addDetail(machineDetails, "Host", data.hostname);
  addDetail(machineDetails, "Platform", data.platform);
  addDetail(machineDetails, "Node", data.node);
  addDetail(machineDetails, "Uptime", `${data.uptimeSeconds}s`);
  const network = Array.isArray(data.network) && data.network.length
    ? data.network.map((item) => `${item.interface}: ${item.address}`).join(" | ")
    : "No LAN IPv4 detected";
  addDetail(machineDetails, "LAN IPv4", network);

  diskDetails.replaceChildren();
  const dataDisk = data.disk && data.disk.data;
  const obsDisk = data.disk && data.disk.obs;
  addDetail(diskDetails, "Data free", dataDisk && dataDisk.available ? formatBytes(dataDisk.freeBytes) : "N/A");
  addDetail(diskDetails, "OBS free", obsDisk && obsDisk.available ? formatBytes(obsDisk.freeBytes) : "N/A");
  addDetail(diskDetails, "Data path", data.paths && data.paths.dataDir);
  addDetail(diskDetails, "OBS path", data.paths && data.paths.obsDir);

  checkList.replaceChildren();
  for (const check of data.checks || []) {
    const row = document.createElement("div");
    row.className = "check-item";
    row.dataset.state = check.ok ? "ok" : "error";
    const icon = document.createElement("b");
    icon.textContent = check.ok ? "PASS" : "FAIL";
    const name = document.createElement("span");
    name.textContent = check.name;
    const detail = document.createElement("code");
    detail.textContent = check.detail;
    row.append(icon, name, detail);
    checkList.appendChild(row);
  }
}

async function refresh() {
  refreshButton.disabled = true;
  try {
    const response = await fetch("/api/field-status", { cache: "no-store" });
    const data = await response.json();
    render(data);
  } catch (error) {
    card.dataset.state = "error";
    overall.textContent = "SERVER NOT REACHABLE";
    checkedAt.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", refresh);
refresh();
setInterval(refresh, 5000);
