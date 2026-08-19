"use strict";

(function initializeTeamSetupSafety() {
  if (typeof io !== "function") return;

  const socket = io();

  function render(data) {
    const selectA = document.getElementById("teamASelect");
    const selectB = document.getElementById("teamBSelect");

    if (selectA && selectB) {
      Array.from(selectA.options).forEach((option) => {
        option.disabled = option.value === data.teamNameB;
      });
      Array.from(selectB.options).forEach((option) => {
        option.disabled = option.value === data.teamNameA;
      });
    }

    const ready = data.status === "READY";
    document.querySelectorAll(
      "#teamASelect, #teamBSelect, #addTeamForm input, #addTeamForm button, #editTeamForm input, #editTeamForm select, #editTeamForm button"
    ).forEach((control) => {
      control.disabled = !ready;
    });
  }

  socket.on("connect", () => socket.emit("force-sync"));
  socket.on("update", render);
})();
