"use strict";

(function initializeTeamScorePage() {
  const team = String(document.body.dataset.team || "").toUpperCase();
  if (team !== "A" && team !== "B") return;

  const status = document.getElementById("status");
  const scoringButtons = Array.from(document.querySelectorAll(
    "[data-score], [data-mission], [data-shot-mission], #endMatchButton"
  ));

  function missionShots(data) {
    const value = data[`missionShots${team}`];
    return Array.isArray(value) ? value : [];
  }

  function recordedMissionShots(data) {
    const value = data[`recordedMissionShots${team}`];
    return Array.isArray(value) ? value : missionShots(data);
  }

  function setAllScoringEnabled(enabled) {
    scoringButtons.forEach((button) => { button.disabled = !enabled; });
  }

  function renderMissionShots(data) {
    const shots = missionShots(data);
    [1, 2, 3, 4].forEach((mission) => {
      const element = document.getElementById(`missionShot${team}${mission}`);
      if (element) element.innerText = shots[mission - 1] || "--.--";
    });
  }

  function updateButtonState(data) {
    const running = data.status === "RUNNING";
    const shots = missionShots(data);

    document.querySelectorAll("[data-score]").forEach((button) => {
      button.disabled = !running;
    });

    document.querySelectorAll("[data-mission]").forEach((button) => {
      const index = Number(button.dataset.mission) - 1;
      button.disabled = !running || shots[index] !== "";
    });

    document.querySelectorAll("[data-shot-mission]").forEach((button) => {
      const index = Number(button.dataset.shotMission) - 1;
      button.disabled = !running || shots[index] !== "";
    });

    const endButton = document.getElementById("endMatchButton");
    if (endButton) {
      const recorded = recordedMissionShots(data);
      endButton.disabled = !running || (Array.isArray(recorded) && recorded[3] !== "");
    }
  }

  function showOffline() {
    status.innerText = "NO SERVER";
    status.dataset.state = "NO_SERVER";
    setAllScoringEnabled(false);
  }

  if (typeof io !== "function") {
    showOffline();
    return;
  }

  const socket = io();
  setAllScoringEnabled(false);

  document.querySelectorAll("[data-score]").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("add-score", { team, point: Number(button.dataset.score) });
    });
  });

  document.querySelectorAll("[data-mission]").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("mission-score", {
        team,
        mission: Number(button.dataset.mission),
      });
    });
  });

  document.querySelectorAll("[data-shot-mission]").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("mission-shot", {
        team,
        mission: Number(button.dataset.shotMission),
      });
    });
  });

  const endButton = document.getElementById("endMatchButton");
  if (endButton) {
    endButton.addEventListener("click", () => {
      socket.emit("end-with-bonus", { team });
    });
  }

  socket.on("disconnect", showOffline);
  socket.on("connect_error", showOffline);
  socket.on("update", (data) => {
    const score = document.getElementById(`score${team}`);
    const teamName = document.getElementById(`teamName${team}`);
    const shot = document.getElementById(`shot${team}`);

    if (score) score.innerText = data[`score${team}`];
    if (teamName) teamName.innerText = data[`teamName${team}`] || `TEAM ${team}`;
    document.getElementById("time").innerText = data.time;
    if (shot) shot.innerText = data[`shot${team}`] || "--.--";

    renderMissionShots(data);
    status.innerText = data.status;
    status.dataset.state = data.status;
    updateButtonState(data);

    if (typeof applyFinalWarning === "function") applyFinalWarning(data);
  });
})();
