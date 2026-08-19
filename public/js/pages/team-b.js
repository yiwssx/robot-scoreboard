"use strict";

const status = document.getElementById("status");
    const buttons = document.querySelectorAll("button");

    function setButtonsEnabled(enabled) {
      buttons.forEach((button) => {
        button.disabled = !enabled;
      });
    }

    function setPointButtonsEnabled(enabled) {
      document.querySelectorAll("[data-score]").forEach((button) => {
        button.disabled = !enabled;
      });
    }

    function setTimerButtonsEnabled(enabled) {
      document.getElementById("startTimeButton").disabled = !enabled;
      document.getElementById("stopTimeButton").disabled = !enabled;
    }

    function setEndButtonEnabled(enabled) {
      document.getElementById("endMatchButton").disabled = !enabled;
    }

    function setMissionButtonsEnabled(data) {
      const missionShots = Array.isArray(data.missionShotsB) ? data.missionShotsB : [];

      document.querySelectorAll("[data-mission]").forEach((button) => {
        const missionIndex = Number(button.dataset.mission) - 1;
        button.disabled = data.status === "FINISH" || missionShots[missionIndex] !== "";
      });
    }

    function setMissionShotButtonsEnabled(data) {
      const missionShots = Array.isArray(data.missionShotsB) ? data.missionShotsB : [];

      document.querySelectorAll("[data-shot-mission]").forEach((button) => {
        const missionIndex = Number(button.dataset.shotMission) - 1;
        button.disabled = data.status === "FINISH" || missionShots[missionIndex] !== "";
      });
    }

    function renderMissionShots(data) {
      const missionShots = Array.isArray(data.missionShotsB) ? data.missionShotsB : [];

      [1, 2, 3, 4].forEach((mission) => {
        document.getElementById(`missionShotB${mission}`).innerText = missionShots[mission - 1] || "--.--";
      });
    }

    function showOffline() {
      status.innerText = "NO SERVER";
      status.dataset.state = "NO_SERVER";
      setButtonsEnabled(false);
    }

    function addScore(socket, point) {
      socket.emit("add-score", {
        team: "B",
        point: point
      });
    }

    if (typeof io !== "function") {
      showOffline();
    } else {
      const socket = io();

      setButtonsEnabled(false);

      document.getElementById("startTimeButton").addEventListener("click", () => {
        if (typeof unlockWarningAudio === "function") unlockWarningAudio();
        socket.emit("start-time");
      });

      document.getElementById("stopTimeButton").addEventListener("click", () => {
        socket.emit("stop-time");
      });

      document.getElementById("resetScoreButton").addEventListener("click", () => {
        socket.emit("reset-score");
      });

      document.getElementById("endMatchButton").addEventListener("click", () => {
        socket.emit("end-with-bonus", {
          team: "B",
          point: 20
        });
      });

      document.querySelectorAll("[data-score]").forEach((button) => {
        button.addEventListener("click", () => {
          addScore(socket, Number(button.dataset.score));
        });
      });

      document.querySelectorAll("[data-mission]").forEach((button) => {
        button.addEventListener("click", () => {
          socket.emit("mission-score", {
            team: "B",
            mission: Number(button.dataset.mission),
            point: Number(button.dataset.point)
          });
        });
      });

      document.querySelectorAll("[data-shot-mission]").forEach((button) => {
        button.addEventListener("click", () => {
          socket.emit("mission-shot", {
            team: "B",
            mission: Number(button.dataset.shotMission)
          });
        });
      });

      socket.on("connect", () => {
        setButtonsEnabled(true);
      });

      socket.on("disconnect", showOffline);
      socket.on("connect_error", showOffline);

      socket.on("update", (data) => {
        document.getElementById("scoreB").innerText = data.scoreB;
        document.getElementById("teamNameB").innerText = data.teamNameB || "TEAM B";
        document.getElementById("time").innerText = data.time;
        document.getElementById("shotB").innerText = data.shotB || "--.--";
        renderMissionShots(data);
        status.innerText = data.status;
        status.dataset.state = data.status;
        document.getElementById("resetScoreButton").disabled = data.status === "RUNNING";
        setTimerButtonsEnabled(data.status !== "FINISH");
        setPointButtonsEnabled(data.status !== "FINISH");
        setMissionButtonsEnabled(data);
        setMissionShotButtonsEnabled(data);
        const recordedMissionShots = Array.isArray(data.recordedMissionShotsB) ? data.recordedMissionShotsB : data.missionShotsB;
        const missionFourRecorded = Array.isArray(recordedMissionShots) && recordedMissionShots[3] !== "";
        setEndButtonEnabled(!missionFourRecorded && (data.status === "FINISH" || data.shotB === ""));
        if (typeof applyFinalWarning === "function") applyFinalWarning(data);
      });
    }
