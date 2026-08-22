"use strict";

function registerMatchSocket({ io, socket, scoreboard, context, reply }) {
  socket.on("set-time", (seconds, callback) => {
    reply("set-time", callback, scoreboard.resetTimer(seconds, context()));
  });

  socket.on("start-time", (callback) => {
    reply("start-time", callback, scoreboard.startTimer(context()));
  });

  socket.on("stop-time", (callback) => {
    reply("stop-time", callback, scoreboard.stopTimer(context()));
  });

  socket.on("reset-score", (callback) => {
    reply("reset-score", callback, scoreboard.resetScore(context()));
  });

  socket.on("reset-all", (callback) => {
    reply("reset-all", callback, scoreboard.resetAll(context()));
  });

  socket.on("force-sync", async (callback) => {
    await scoreboard.forcePersist();
    io.emit("update", scoreboard.getUpdateData());
    io.of("/broadcast").emit("broadcast:update", scoreboard.getBroadcastData());
    if (typeof callback === "function") callback({ synced: true, ok: true });
  });
}

module.exports = { registerMatchSocket };
