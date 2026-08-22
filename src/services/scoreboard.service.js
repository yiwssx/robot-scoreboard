"use strict";

const { normalizeRules } = require("../config/competition-rules");
const { Persistence } = require("../infrastructure/persistence/file-store");
const { TextFileBroadcastOutput } = require("../infrastructure/broadcast/text-file-output");
const { EventLog } = require("../infrastructure/logging/event-log");
const { createScoreboardState, STATUSES } = require("../application/scoreboard-state");
const { createScoreboardRuntime } = require("../application/scoreboard-runtime");
const { createTeamService } = require("./team.service");
const { createResultService } = require("./result.service");
const { createMatchService } = require("./match.service");
const { createScoringService } = require("./scoring.service");

function createScoreboard({ dataDir, obsDir, onUpdate = () => {}, rules: suppliedRules = {} }) {
  const rules = normalizeRules(suppliedRules);
  const state = createScoreboardState(rules);
  const persistence = new Persistence({ dataDir, legacyObsDir: obsDir });
  const broadcastOutput = new TextFileBroadcastOutput({ obsDir });
  const eventLog = new EventLog(dataDir);
  const runtime = createScoreboardRuntime({ state, rules, persistence, broadcastOutput, eventLog, onUpdate });

  const teamService = createTeamService({ state, persistence, runtime });
  const resultService = createResultService({ state, rules, persistence, runtime });
  const matchService = createMatchService({ state, rules, persistence, runtime, resultService });
  const scoringService = createScoringService({ state, rules, runtime, matchService });

  async function initialize() {
    await Promise.all([persistence.ensureDirectories(), broadcastOutput.ensureDirectory()]);
    await teamService.loadTeamData();
    await resultService.loadResults();
    const recovery = await matchService.loadLiveState();
    runtime.saveTeamData();
    runtime.saveResults();
    runtime.persist(true);
    await Promise.all([persistence.flushAll(), broadcastOutput.flushAll()]);
    runtime.log("SERVER_READY", { recovery, rules });
    await eventLog.flush();
  }

  async function shutdown(context = {}) {
    if (state.status === "RUNNING") {
      matchService.syncTimerFromClock(context);
      if (state.status === "RUNNING") state.status = "PAUSED";
    }
    matchService.clearTimer();
    runtime.log("SERVER_SHUTDOWN", {}, context);
    runtime.persist(false);
    await Promise.all([persistence.flushAll(), broadcastOutput.flushAll(), eventLog.flush()]);
  }

  async function forcePersist() {
    runtime.persist(true);
    await Promise.all([persistence.flushAll(), broadcastOutput.flushAll(), eventLog.flush()]);
  }

  return {
    initialize,
    shutdown,
    forcePersist,
    getUpdateData: runtime.updateData,
    getBroadcastData: runtime.broadcastSnapshot,
    getBroadcastHealth: () => broadcastOutput.health(),
    addScore: scoringService.addScore,
    missionScore: scoringService.missionScore,
    missionShot: scoringService.missionShot,
    endWithBonus: scoringService.endWithBonus,
    resetTimer: matchService.resetTimer,
    startTimer: matchService.startTimer,
    stopTimer: matchService.stopTimer,
    resetScore: matchService.resetScore,
    resetAll: matchService.resetAll,
    correctResult: resultService.correctResult,
    finalizeResult: resultService.finalizeResult,
    addTeam: teamService.addTeam,
    editTeam: teamService.editTeam,
    selectTeam: teamService.selectTeam,
    deleteTeam: teamService.deleteTeam,
    setNamesVisible: teamService.setNamesVisible,
    deleteResult: resultService.deleteResult,
    recordEvent: runtime.log,
  };
}

module.exports = { createScoreboard, STATUSES };
