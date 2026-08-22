"use strict";

function registerTeamSocket({ socket, scoreboard, context, reply }) {
  socket.on("team-name-add", (data, callback) => {
    reply("team-name-add", callback, scoreboard.addTeam(data, context()));
  });

  socket.on("team-name-edit", (data, callback) => {
    reply("team-name-edit", callback, scoreboard.editTeam(data, context()));
  });

  socket.on("team-name-select", (data, callback) => {
    reply("team-name-select", callback, scoreboard.selectTeam(data, context()));
  });

  socket.on("team-name-delete", (data, callback) => {
    reply("team-name-delete", callback, scoreboard.deleteTeam(data, context()));
  });

  socket.on("team-names-show", (callback) => {
    reply("team-names-show", callback, scoreboard.setNamesVisible(true, context()));
  });

  socket.on("team-names-hide", (callback) => {
    reply("team-names-hide", callback, scoreboard.setNamesVisible(false, context()));
  });
}

module.exports = { registerTeamSocket };
