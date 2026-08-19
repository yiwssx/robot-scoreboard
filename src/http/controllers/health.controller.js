"use strict";

function createHealthController({ scoreboard }) {
  return function health(req, res) {
    const data = scoreboard.getUpdateData();
    res.json({
      ok: true,
      mode: "offline-lan",
      status: data.status,
      resultLocked: data.resultLocked,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  };
}

module.exports = { createHealthController };
