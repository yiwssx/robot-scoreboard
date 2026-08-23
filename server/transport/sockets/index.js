"use strict";

const { socketContext } = require("./socket-context");
const { createReply } = require("./reply");
const { registerMatchSocket } = require("./match.socket");
const { registerScoringSocket } = require("./scoring.socket");
const { registerTeamSocket } = require("./team.socket");
const { registerResultSocket } = require("./result.socket");
const { normalizeRole } = require("./client-registry");

function registerRoleCommands(role, transport) {
  if (role === "control") {
    registerMatchSocket(transport);
    registerResultSocket(transport);
    return;
  }
  if (role === "team-a") {
    registerScoringSocket({ ...transport, allowedTeam: "A" });
    return;
  }
  if (role === "team-b") {
    registerScoringSocket({ ...transport, allowedTeam: "B" });
    return;
  }
  if (role === "teams") {
    registerTeamSocket(transport);
    registerResultSocket({ ...transport, allowCorrections: false, allowDelete: true });
    return;
  }
  if (role === "status" || role === "unknown") return;

  if (role === "legacy") {
    // Backward compatibility is granted only to clients that omit role metadata entirely.
    registerMatchSocket(transport);
    registerScoringSocket(transport);
    registerTeamSocket(transport);
    registerResultSocket(transport);
  }
}

function registerSockets(io, scoreboard, clientRegistry = null) {
  io.on("connection", (socket) => {
    const role = normalizeRole(socket.handshake && socket.handshake.auth && socket.handshake.auth.role);
    if (clientRegistry) clientRegistry.connect(socket, { namespace: "/", role });
    socket.on("disconnect", () => {
      if (clientRegistry) clientRegistry.disconnect(socket);
    });

    const context = () => ({ ...socketContext(socket), page: role });
    const reply = createReply({ io, socket, scoreboard, context });
    const transport = { io, socket, scoreboard, context, reply };

    socket.emit("update", scoreboard.getUpdateData());
    registerRoleCommands(role, transport);
  });

  const broadcastNamespace = io.of("/broadcast");
  broadcastNamespace.on("connection", (socket) => {
    if (clientRegistry) clientRegistry.connect(socket, { namespace: "/broadcast", role: "overlay" });
    socket.on("disconnect", () => {
      if (clientRegistry) clientRegistry.disconnect(socket);
    });
    socket.emit("broadcast:update", scoreboard.getBroadcastData());
  });

  return { broadcastNamespace };
}

module.exports = { registerSockets, registerRoleCommands };
