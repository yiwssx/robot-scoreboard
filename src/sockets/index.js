"use strict";

const { socketContext } = require("./socket-context");
const { createReply } = require("./reply");
const { registerMatchSocket } = require("./match.socket");
const { registerScoringSocket } = require("./scoring.socket");
const { registerTeamSocket } = require("./team.socket");
const { registerResultSocket } = require("./result.socket");

function registerSockets(io, scoreboard, clientRegistry = null) {
  io.on("connection", (socket) => {
    const role = socket.handshake && socket.handshake.auth && socket.handshake.auth.role;
    if (clientRegistry) clientRegistry.connect(socket, { namespace: "/", role });
    socket.on("disconnect", () => {
      if (clientRegistry) clientRegistry.disconnect(socket);
    });

    const context = () => ({ ...socketContext(socket), page: String(role || "unknown") });
    const reply = createReply({ io, socket, scoreboard, context });
    const transport = { io, socket, scoreboard, context, reply };

    socket.emit("update", scoreboard.getUpdateData());
    registerMatchSocket(transport);
    registerScoringSocket(transport);
    registerTeamSocket(transport);
    registerResultSocket(transport);
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

module.exports = { registerSockets };
