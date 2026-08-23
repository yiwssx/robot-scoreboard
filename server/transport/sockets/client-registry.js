"use strict";

const DECLARED_ROLES = new Set(["control", "team-a", "team-b", "teams", "status", "overlay"]);

function normalizeRole(value) {
  const role = value === undefined || value === null ? "" : String(value).trim().toLowerCase();
  if (!role) return "legacy";
  return DECLARED_ROLES.has(role) ? role : "unknown";
}

function socketAddress(socket) {
  return String(
    socket.handshake && socket.handshake.address
      || socket.request && socket.request.socket && socket.request.socket.remoteAddress
      || ""
  ).slice(0, 120);
}

function createClientRegistry() {
  const clients = new Map();

  function connect(socket, { namespace = "/", role = "unknown" } = {}) {
    const normalizedRole = role === "legacy" ? "legacy" : normalizeRole(role);
    const entry = {
      id: socket.id,
      namespace,
      role: normalizedRole,
      address: socketAddress(socket),
      connectedAt: new Date().toISOString(),
    };
    clients.set(socket.id, entry);
    return entry;
  }

  function disconnect(socket) {
    clients.delete(socket.id);
  }

  function summary() {
    const list = Array.from(clients.values());
    const counts = {};
    list.forEach((client) => {
      counts[client.role] = (counts[client.role] || 0) + 1;
    });
    return {
      total: list.length,
      counts,
      clients: list.map((client) => ({ ...client })),
    };
  }

  return { connect, disconnect, summary };
}

module.exports = { createClientRegistry, normalizeRole };
