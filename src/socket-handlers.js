"use strict";

function registerSocketHandlers(io, scoreboard) {
  function context(socket) {
    return {
      socketId: socket.id,
      ip: socket.handshake && socket.handshake.address,
      page: socket.handshake && socket.handshake.headers && socket.handshake.headers.referer,
    };
  }

  function reply(socket, event, callback, result) {
    if (!result || result.ok === false) {
      const payload = {
        ok: false,
        event,
        code: result && result.code ? result.code : "INVALID_COMMAND",
      };
      socket.emit("action-error", payload);
      io.emit("operator-notice", payload);
      scoreboard.recordEvent("ACTION_REJECTED", payload, context(socket));
      if (typeof callback === "function") callback({ ...payload, ...(result || {}) });
      return;
    }
    if (typeof callback === "function") callback(result);
  }

  io.on("connection", (socket) => {
    const ctx = () => context(socket);
    socket.emit("update", scoreboard.getUpdateData());

    socket.on("add-score", (data, callback) => {
      reply(socket, "add-score", callback, scoreboard.addScore(data && data.team, data && data.point, ctx()));
    });

    socket.on("mission-score", (data, callback) => {
      reply(socket, "mission-score", callback, scoreboard.missionScore(data && data.team, data && data.mission, ctx()));
    });

    socket.on("mission-shot", (data, callback) => {
      reply(socket, "mission-shot", callback, scoreboard.missionShot(data && data.team, data && data.mission, ctx()));
    });

    socket.on("end-with-bonus", (data, callback) => {
      reply(socket, "end-with-bonus", callback, scoreboard.endWithBonus(data && data.team, ctx()));
    });

    socket.on("set-time", (seconds, callback) => {
      reply(socket, "set-time", callback, scoreboard.resetTimer(seconds, ctx()));
    });

    socket.on("start-time", (callback) => {
      reply(socket, "start-time", callback, scoreboard.startTimer(ctx()));
    });

    socket.on("stop-time", (callback) => {
      reply(socket, "stop-time", callback, scoreboard.stopTimer(ctx()));
    });

    socket.on("reset-score", (callback) => {
      reply(socket, "reset-score", callback, scoreboard.resetScore(ctx()));
    });

    socket.on("reset-all", (callback) => {
      reply(socket, "reset-all", callback, scoreboard.resetAll(ctx()));
    });

    socket.on("result-correction", (data, callback) => {
      reply(socket, "result-correction", callback, scoreboard.correctResult(data, ctx()));
    });

    socket.on("result-finalize", (callback) => {
      reply(socket, "result-finalize", callback, scoreboard.finalizeResult(ctx()));
    });

    socket.on("force-sync", async (callback) => {
      await scoreboard.forcePersist();
      io.emit("update", scoreboard.getUpdateData());
      if (typeof callback === "function") callback({ synced: true, ok: true });
    });

    socket.on("team-name-add", (data, callback) => {
      reply(socket, "team-name-add", callback, scoreboard.addTeam(data, ctx()));
    });

    socket.on("team-name-edit", (data, callback) => {
      reply(socket, "team-name-edit", callback, scoreboard.editTeam(data, ctx()));
    });

    socket.on("team-name-select", (data, callback) => {
      reply(socket, "team-name-select", callback, scoreboard.selectTeam(data, ctx()));
    });

    socket.on("team-name-delete", (data, callback) => {
      reply(socket, "team-name-delete", callback, scoreboard.deleteTeam(data, ctx()));
    });

    socket.on("team-names-show", (callback) => {
      reply(socket, "team-names-show", callback, scoreboard.setNamesVisible(true, ctx()));
    });

    socket.on("team-names-hide", (callback) => {
      reply(socket, "team-names-hide", callback, scoreboard.setNamesVisible(false, ctx()));
    });

    socket.on("match-result-delete", (data, callback) => {
      reply(socket, "match-result-delete", callback, scoreboard.deleteResult(data, ctx()));
    });
  });
}

module.exports = { registerSocketHandlers };
