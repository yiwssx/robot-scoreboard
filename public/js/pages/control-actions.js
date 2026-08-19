"use strict";

(function bindControlActions() {
  const startButton = document.getElementById("startTimeButton");
  const stopButton = document.getElementById("stopTimeButton");
  const syncButton = document.getElementById("forceSyncButton");

  if (startButton) startButton.addEventListener("click", () => startTime());
  if (stopButton) stopButton.addEventListener("click", () => stopTime());
  if (syncButton) syncButton.addEventListener("click", () => forceSyncScreens());
})();
