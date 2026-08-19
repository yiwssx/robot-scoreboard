"use strict";

function registerSocketHandlers(io, scoreboard) {
  function reply(socket, event, callback, result) {
    if (!result || result.ok === false) {
      const payload = {
        ok: false,
        event,
        code: result && result.code ? result.code : "INVALID_COMMAND",
      };
      socket.emit("action-error", payload);
      if (typeof callback === "function") callback({ ...payload, ...(result || {}) });
      return;
    }
    if (typeof callback === "function") callback(result);
  }

  io.on("connection", (socket) => {
    socket.emit("update", scoreboard.getUpdateData());

    socket.on("add-score", (data, callback) => {
      reply(socket, "add-score", callback, scoreboard.addScore(data && data.team, data && data.point));
    });

    socket.on("mission-score", (data, callback) => {
      reply(socket, "mission-score", callback, scoreboard.missionScore(data && data.team, data && data.mission));
    });

    socket.on("mission-shot", (data, callback) => {
      reply(socket, "mission-shot", callback, scoreboard.missionShot(data && data.team, data && data.mission));
    });

    socket.on("end-with-bonus", (data, callback) => {
      reply(socket, "end-with-bonus", callback, scoreboard.endWithBonus(data && data.team));
    });

    socket.on("set-time", (seconds, callback) => {
      const matchDuration = scoreboard.resetTimer(seconds);
      if (typeof callback === "function") callback({ ok: true, matchDuration });
    });

    socket.on("start-time", (callback) => {
      const ok = scoreboard.startTimer();
      if (typeof callback === "function") callback({ ok, status: scoreboard.getUpdateData().status });
    });

    socket.on("stop-time", (callback) => {
      const ok = scoreboard.stopTimer();
      if (typeof callback === "function") callback({ ok, status: scoreboard.getUpdateData().status });
    });

    socket.on("reset-score", (callback) => {
      reply(socket, "reset-score", callback, scoreboard.resetScore());
    });

    socket.on("reset-all", (callback) => {
      reply(socket, "reset-all", callback, scoreboard.resetAll());
    });

    socket.on("force-sync", (callback) => {
      io.emit("update", scoreboard.getUpdateData());
      if (typeof callback === "function") callback({ synced: true, ok: true });
    });

    socket.on("team-name-add", (data, callback) => {
      reply(socket, "team-name-add", callback, scoreboard.addTeam(data));
    });

    socket.on("team-name-edit", (data, callback) => {
      reply(socket, "team-name-edit", callback, scoreboard.editTeam(data));
    });

    socket.on("team-name-select", (data, callback) => {
      reply(socket, "team-name-select", callback, scoreboard.selectTeam(data));
    });

    socket.on("team-name-delete", (data, callback) => {
      reply(socket, "team-name-delete", callback, scoreboard.deleteTeam(data));
    });

    socket.on("team-names-show", (callback) => {
      reply(socket, "team-names-show", callback, scoreboard.setNamesVisible(true));
    });

    socket.on("team-names-hide", (callback) => {
      reply(socket, "team-names-hide", callback, scoreboard.setNamesVisible(false));
    });

    socket.on("match-result-delete", (data, callback) => {
      const result = scoreboard.deleteResult(data);
      if (typeof callback === "function") callback(result);
    });
  });
}

module.exports = { registerSocketHandlers };
