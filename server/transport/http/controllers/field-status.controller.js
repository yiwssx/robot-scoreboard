"use strict";

function createFieldStatusController({ fieldReadiness, scoreboard }) {
  return async function fieldStatus(req, res) {
    const diagnostics = await fieldReadiness.inspect();
    const state = scoreboard.getUpdateData();
    res.status(diagnostics.ok ? 200 : 503).json({
      ...diagnostics,
      scoreboard: {
        status: state.status,
        resultLocked: Boolean(state.resultLocked),
        teamNameA: state.teamNameA,
        teamNameB: state.teamNameB,
        time: state.time,
      },
    });
  };
}

module.exports = { createFieldStatusController };
