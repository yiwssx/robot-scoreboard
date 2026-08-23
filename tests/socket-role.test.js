"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { registerRoleCommands } = require("../server/transport/sockets");
const { createClientRegistry, normalizeRole } = require("../server/transport/sockets/client-registry");
const { registerScoringSocket } = require("../server/transport/sockets/scoring.socket");

function fakeSocket() {
  const handlers = new Map();
  return { handlers, on(name, handler) { handlers.set(name, handler); } };
}

function transport(socket) {
  return {
    io: { emit() {}, of() { return { emit() {} }; } },
    socket,
    scoreboard: {},
    context: () => ({}),
    reply() {},
  };
}

test("client roles expose only their intended command surface", () => {
  const control = fakeSocket();
  registerRoleCommands("control", transport(control));
  assert.equal(control.handlers.has("start-time"), true);
  assert.equal(control.handlers.has("result-correction"), true);
  assert.equal(control.handlers.has("add-score"), false);
  assert.equal(control.handlers.has("team-name-add"), false);

  const teamA = fakeSocket();
  registerRoleCommands("team-a", transport(teamA));
  assert.equal(teamA.handlers.has("add-score"), true);
  assert.equal(teamA.handlers.has("start-time"), false);
  assert.equal(teamA.handlers.has("reset-all"), false);
  assert.equal(teamA.handlers.has("result-finalize"), false);

  const teams = fakeSocket();
  registerRoleCommands("teams", transport(teams));
  assert.equal(teams.handlers.has("team-name-add"), true);
  assert.equal(teams.handlers.has("match-result-delete"), true);
  assert.equal(teams.handlers.has("result-correction"), false);
  assert.equal(teams.handlers.has("start-time"), false);

  const status = fakeSocket();
  registerRoleCommands("status", transport(status));
  assert.equal(status.handlers.size, 0);
});

test("legacy compatibility requires omitted role metadata; invalid roles receive no command surface", () => {
  assert.equal(normalizeRole(undefined), "legacy");
  assert.equal(normalizeRole(""), "legacy");
  assert.equal(normalizeRole("not-a-real-role"), "unknown");

  const legacy = fakeSocket();
  registerRoleCommands("legacy", transport(legacy));
  assert.equal(legacy.handlers.has("start-time"), true);
  assert.equal(legacy.handlers.has("add-score"), true);

  const unknown = fakeSocket();
  registerRoleCommands("unknown", transport(unknown));
  assert.equal(unknown.handlers.size, 0);
});

test("client registry preserves an already-normalized legacy role for diagnostics", () => {
  const registry = createClientRegistry();
  registry.connect({ id: "legacy-1", handshake: {} }, { role: "legacy" });
  const summary = registry.summary();
  assert.equal(summary.counts.legacy, 1);
  assert.equal(summary.clients[0].role, "legacy");
});

test("team scoring transport rejects a payload for the other side", () => {
  const socket = fakeSocket();
  let rejected = null;
  let addScoreCalled = false;
  registerScoringSocket({
    socket,
    allowedTeam: "A",
    scoreboard: { addScore() { addScoreCalled = true; return { ok: true }; } },
    context: () => ({}),
    reply(event, callback, result) { rejected = { event, result }; },
  });
  socket.handlers.get("add-score")({ team: "B", point: 10 }, () => {});
  assert.equal(addScoreCalled, false);
  assert.equal(rejected.event, "add-score");
  assert.equal(rejected.result.code, "ROLE_TEAM_MISMATCH");
});
