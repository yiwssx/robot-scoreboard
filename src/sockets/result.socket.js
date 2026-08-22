"use strict";

function registerResultSocket({ socket, scoreboard, context, reply, allowCorrections = true, allowDelete = true }) {
  if (allowCorrections) {
    socket.on("result-correction", (data, callback) => {
      reply("result-correction", callback, scoreboard.correctResult(data, context()));
    });

    socket.on("result-finalize", (callback) => {
      reply("result-finalize", callback, scoreboard.finalizeResult(context()));
    });
  }

  if (allowDelete) {
    socket.on("match-result-delete", (data, callback) => {
      reply("match-result-delete", callback, scoreboard.deleteResult(data, context()));
    });
  }
}

module.exports = { registerResultSocket };
