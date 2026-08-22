"use strict";

const ALLOWED_ROLES = new Set(["control", "team-a", "team-b", "teams", "status", "overlay", "unknown"]);

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return ALLOWED_ROLES.has(role) ? role : "unknown";
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
    const entry = {
      id: socket.id,
      namespace,
      role: normalizeRole(role),
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
