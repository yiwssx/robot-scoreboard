"use strict";

function cleanTeamName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanSchoolName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function normalizeTeamWeight(value) {
  if (value === "" || value === null || value === undefined) return null;
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const rounded = Math.round(weight * 10) / 10;
  return rounded > 0 ? rounded : null;
}

function normalizeTeam(value) {
  const team = String(value || "").toUpperCase();
  return team === "A" || team === "B" ? team : null;
}

module.exports = {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeTeam,
};
