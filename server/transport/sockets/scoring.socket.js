"use strict";

function registerScoringSocket({ socket, scoreboard, context, reply, allowedTeam = null }) {
  function guardTeam(event, data, callback) {
    const requestedTeam = data && data.team;
    if (allowedTeam && requestedTeam !== allowedTeam) {
      reply(event, callback, { ok: false, code: "ROLE_TEAM_MISMATCH" });
      return false;
    }
    return true;
  }

  socket.on("add-score", (data, callback) => {
    if (!guardTeam("add-score", data, callback)) return;
    reply("add-score", callback, scoreboard.addScore(data && data.team, data && data.point, context()));
  });

  socket.on("mission-score", (data, callback) => {
    if (!guardTeam("mission-score", data, callback)) return;
    reply("mission-score", callback, scoreboard.missionScore(data && data.team, data && data.mission, context()));
  });

  socket.on("mission-shot", (data, callback) => {
    if (!guardTeam("mission-shot", data, callback)) return;
    reply("mission-shot", callback, scoreboard.missionShot(data && data.team, data && data.mission, context()));
  });

  socket.on("end-with-bonus", (data, callback) => {
    if (!guardTeam("end-with-bonus", data, callback)) return;
    reply("end-with-bonus", callback, scoreboard.endWithBonus(data && data.team, context()));
  });
}

module.exports = { registerScoringSocket };
