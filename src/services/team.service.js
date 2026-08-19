"use strict";

const {
  cleanTeamName,
  cleanSchoolName,
  normalizeTeamWeight,
  normalizeTeam,
} = require("../domain");

function createTeamService({ state, persistence, runtime }) {
  function onlyReady() {
    return state.status === "READY" ? null : { ok: false, code: "MATCH_NOT_READY" };
  }

  async function loadTeamData() {
    const saved = await persistence.firstExistingJson("team-names.json", "team-names.json", null);
    if (saved && typeof saved === "object") {
      runtime.normalizeTeamList(saved.teamNames);
      state.teamWeights = {};
      state.teamSchools = {};
      state.teamNames.forEach((name) => runtime.setTeamWeight(name, saved.teamWeights && saved.teamWeights[name]));
      state.teamNames.forEach((name) => runtime.setTeamSchool(name, saved.teamSchools && saved.teamSchools[name]));
      state.teamNameA = cleanTeamName(saved.teamNameA) || state.teamNames[0] || "TEAM A";
      state.teamNameB = cleanTeamName(saved.teamNameB) || state.teamNames[1] || "TEAM B";
      state.teamNamesVisible = typeof saved.teamNamesVisible === "boolean" ? saved.teamNamesVisible : true;
      state.teamNameA = runtime.addTeamNameToList(state.teamNameA);
      state.teamNameB = runtime.addTeamNameToList(state.teamNameB);
      runtime.ensureDistinctSelectedTeams();
      return;
    }

    const savedNameA = cleanTeamName(await persistence.readLegacyText("team-name-a.text"));
    const savedNameB = cleanTeamName(await persistence.readLegacyText("team-name-b.text"));
    state.teamNameA = runtime.addTeamNameToList(savedNameA || "TEAM A");
    state.teamNameB = runtime.addTeamNameToList(savedNameB || "TEAM B");
    runtime.ensureDistinctSelectedTeams();
  }

  function addTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const name = cleanTeamName(data && data.name);
    if (!name) return { ok: false, code: "INVALID_TEAM_NAME" };
    if (runtime.findTeamNameIndex(name) >= 0) return { ok: false, code: "TEAM_NAME_ALREADY_EXISTS" };
    state.teamNames.push(name);
    const weight = normalizeTeamWeight(data && data.weight);
    if (weight !== null) runtime.setTeamWeight(name, weight);
    const school = cleanSchoolName(data && data.school);
    if (school) runtime.setTeamSchool(name, school);
    runtime.saveTeamData();
    runtime.log("TEAM_ADD", { name }, context);
    runtime.emit();
    return { ok: true };
  }

  function editTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const oldName = cleanTeamName(data && data.oldName);
    const newName = cleanTeamName(data && data.newName);
    const index = runtime.findTeamNameIndex(oldName);
    if (index < 0 || !newName) return { ok: false, code: "INVALID_TEAM_NAME" };
    const duplicate = runtime.findTeamNameIndex(newName);
    if (duplicate >= 0 && duplicate !== index) return { ok: false, code: "TEAM_NAME_ALREADY_EXISTS" };

    const previous = state.teamNames[index];
    const previousWeight = runtime.getTeamWeight(previous);
    const previousSchool = runtime.getTeamSchool(previous);
    state.teamNames[index] = newName;
    delete state.teamWeights[previous];
    delete state.teamSchools[previous];
    runtime.setTeamWeight(newName, data && data.weight === undefined ? previousWeight : data.weight);
    runtime.setTeamSchool(newName, data && data.school === undefined ? previousSchool : data.school);
    if (state.teamNameA === previous) state.teamNameA = newName;
    if (state.teamNameB === previous) state.teamNameB = newName;
    runtime.saveTeamData();
    runtime.log("TEAM_EDIT", { oldName: previous, newName }, context);
    runtime.emit();
    return { ok: true };
  }

  function selectTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const team = normalizeTeam(data && data.team);
    const selectedIndex = runtime.findTeamNameIndex(data && data.name);
    if (!team || selectedIndex < 0) return { ok: false, code: "INVALID_TEAM" };
    const selected = state.teamNames[selectedIndex];
    const other = team === "A" ? state.teamNameB : state.teamNameA;
    if (selected === other) return { ok: false, code: "SAME_TEAM_BOTH_SIDES" };
    if (team === "A") state.teamNameA = selected;
    else state.teamNameB = selected;
    runtime.saveTeamData();
    runtime.log("TEAM_SELECT", { side: team, name: selected }, context);
    runtime.emit();
    return { ok: true };
  }

  function deleteTeam(data, context = {}) {
    const guard = onlyReady();
    if (guard) return guard;
    const name = cleanTeamName(data && data.name);
    const index = runtime.findTeamNameIndex(name);
    if (index < 0 || state.teamNames.length <= 2) return { ok: false, code: "TEAM_DELETE_NOT_ALLOWED" };
    const deleted = state.teamNames[index];
    state.teamNames.splice(index, 1);
    delete state.teamWeights[deleted];
    delete state.teamSchools[deleted];
    if (state.teamNameA === deleted) state.teamNameA = state.teamNames.find((item) => item !== state.teamNameB) || state.teamNames[0];
    if (state.teamNameB === deleted) state.teamNameB = state.teamNames.find((item) => item !== state.teamNameA) || state.teamNames[1] || state.teamNames[0];
    runtime.ensureDistinctSelectedTeams();
    runtime.saveTeamData();
    runtime.log("TEAM_DELETE", { name: deleted }, context);
    runtime.emit();
    return { ok: true };
  }

  function setNamesVisible(visible, context = {}) {
    state.teamNamesVisible = Boolean(visible);
    runtime.saveTeamData();
    runtime.log(state.teamNamesVisible ? "TEAM_NAMES_SHOW" : "TEAM_NAMES_HIDE", {}, context);
    runtime.emit();
    return { ok: true };
  }

  return {
    loadTeamData,
    addTeam,
    editTeam,
    selectTeam,
    deleteTeam,
    setNamesVisible,
  };
}

module.exports = { createTeamService };
