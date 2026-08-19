"use strict";

const { socketContext } = require("./socket-context");
const { createReply } = require("./reply");
const { registerMatchSocket } = require("./match.socket");
const { registerScoringSocket } = require("./scoring.socket");
const { registerTeamSocket } = require("./team.socket");
const { registerResultSocket } = require("./result.socket");

function registerSockets(io, scoreboard) {
  io.on("connection", (socket) => {
    const context = () => socketContext(socket);
    const reply = createReply({ io, socket, scoreboard, context });
    const transport = { io, socket, scoreboard, context, reply };

    socket.emit("update", scoreboard.getUpdateData());
    registerMatchSocket(transport);
    registerScoringSocket(transport);
    registerTeamSocket(transport);
    registerResultSocket(transport);
  });
}

module.exports = { registerSockets };
