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
      const missionShots = Array.isArray(data.missionShotsA) ? data.missionShotsA : [];

      document.querySelectorAll("[data-mission]").forEach((button) => {
        const missionIndex = Number(button.dataset.mission) - 1;
        button.disabled = data.status === "FINISH" || missionShots[missionIndex] !== "";
      });
    }

    function setMissionShotButtonsEnabled(data) {
      const missionShots = Array.isArray(data.missionShotsA) ? data.missionShotsA : [];

      document.querySelectorAll("[data-shot-mission]").forEach((button) => {
        const missionIndex = Number(button.dataset.shotMission) - 1;
        button.disabled = data.status === "FINISH" || missionShots[missionIndex] !== "";
      });
    }

    function renderMissionShots(data) {
      const missionShots = Array.isArray(data.missionShotsA) ? data.missionShotsA : [];

      [1, 2, 3, 4].forEach((mission) => {
        document.getElementById(`missionShotA${mission}`).innerText = missionShots[mission - 1] || "--.--";
      });
    }

    function showOffline() {
      status.innerText = "NO SERVER";
      status.dataset.state = "NO_SERVER";
      setButtonsEnabled(false);
    }

    function addScore(socket, point) {
      socket.emit("add-score", {
        team: "A",
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
          team: "A",
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
            team: "A",
            mission: Number(button.dataset.mission),
            point: Number(button.dataset.point)
          });
        });
      });

      document.querySelectorAll("[data-shot-mission]").forEach((button) => {
        button.addEventListener("click", () => {
          socket.emit("mission-shot", {
            team: "A",
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
        document.getElementById("scoreA").innerText = data.scoreA;
        document.getElementById("teamNameA").innerText = data.teamNameA || "TEAM A";
        document.getElementById("time").innerText = data.time;
        document.getElementById("shotA").innerText = data.shotA || "--.--";
        renderMissionShots(data);
        status.innerText = data.status;
        status.dataset.state = data.status;
        document.getElementById("resetScoreButton").disabled = data.status === "RUNNING";
        setTimerButtonsEnabled(data.status !== "FINISH");
        setPointButtonsEnabled(data.status !== "FINISH");
        setMissionButtonsEnabled(data);
        setMissionShotButtonsEnabled(data);
        const recordedMissionShots = Array.isArray(data.recordedMissionShotsA) ? data.recordedMissionShotsA : data.missionShotsA;
        const missionFourRecorded = Array.isArray(recordedMissionShots) && recordedMissionShots[3] !== "";
        setEndButtonEnabled(!missionFourRecorded && (data.status === "FINISH" || data.shotA === ""));
        if (typeof applyFinalWarning === "function") applyFinalWarning(data);
      });
    }
