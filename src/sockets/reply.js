"use strict";

function createReply({ io, socket, scoreboard, context }) {
  return function reply(event, callback, result) {
    if (!result || result.ok === false) {
      const payload = {
        ok: false,
        event,
        code: result && result.code ? result.code : "INVALID_COMMAND",
      };
      socket.emit("action-error", payload);
      io.emit("operator-notice", payload);
      scoreboard.recordEvent("ACTION_REJECTED", payload, context());
      if (typeof callback === "function") callback({ ...payload, ...(result || {}) });
      return;
    }
    if (typeof callback === "function") callback(result);
  };
}

module.exports = { createReply };
