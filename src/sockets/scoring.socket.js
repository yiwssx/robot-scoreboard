"use strict";

function registerScoringSocket({ socket, scoreboard, context, reply }) {
  socket.on("add-score", (data, callback) => {
    reply("add-score", callback, scoreboard.addScore(data && data.team, data && data.point, context()));
  });

  socket.on("mission-score", (data, callback) => {
    reply("mission-score", callback, scoreboard.missionScore(data && data.team, data && data.mission, context()));
  });

  socket.on("mission-shot", (data, callback) => {
    reply("mission-shot", callback, scoreboard.missionShot(data && data.team, data && data.mission, context()));
  });

  socket.on("end-with-bonus", (data, callback) => {
    reply("end-with-bonus", callback, scoreboard.endWithBonus(data && data.team, context()));
  });
}

module.exports = { registerScoringSocket };
