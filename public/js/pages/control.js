"use strict";

const socket = io();
    const matchSaveState = document.getElementById("matchSaveState");
    const resultMessage = document.getElementById("resultMessage");
    const matchHistoryTable = document.getElementById("matchHistoryTable");
    const matchHistoryBody = document.getElementById("matchHistoryBody");
    const emptyHistory = document.getElementById("emptyHistory");
    const historyCount = document.getElementById("historyCount");
    const pdfDownloadButton = document.getElementById("pdfDownloadButton");

    let matchResults = [];
    let serverConnected = false;

    function startTime() {
      if (typeof unlockWarningAudio === "function") unlockWarningAudio();
      socket.emit("start-time");
    }

    function stopTime() {
      socket.emit("stop-time");
    }

    function resetScore() {
      socket.emit("reset-score");
    }

    function resetAll() {
      socket.emit("reset-all");
    }

    function forceSyncScreens() {
      const syncButton = document.getElementById("forceSyncButton");
      let syncDone = false;

      function finishSync(label) {
        syncDone = true;
        syncButton.disabled = false;
        syncButton.innerText = label;
        window.setTimeout(() => {
          syncButton.innerText = "SYNC SCREENS";
        }, 1200);
      }

      syncButton.disabled = true;
      syncButton.innerText = "SYNCING...";
      socket.emit("force-sync", (response) => {
        if (syncDone) return;
        finishSync(response && response.synced ? "SYNCED" : "SYNC SCREENS");
      });

      window.setTimeout(() => {
        if (syncDone) return;
        finishSync("NO SERVER");
      }, 1200);
    }

    function formatClock(seconds) {
      const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(Number(seconds), 0) : 0;
      const minutes = Math.floor(safeSeconds / 60);
      const remainingSeconds = Math.floor(safeSeconds % 60);
      return `${String(minutes).padStart(2, "0")}.${String(remainingSeconds).padStart(2, "0")}`;
    }

    function formatSavedAt(value) {
      const savedDate = new Date(value);
      if (Number.isNaN(savedDate.getTime())) return "-";

      return savedDate.toLocaleString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function showResultStatus(message, state) {
      resultMessage.innerText = message;
      resultMessage.dataset.state = state || "";
    }

    function updateMatchSaveState(data) {
      const timeElapsed = Number(data.timeElapsed) || 0;
      const matchDuration = Number(data.matchDuration) || 180;

      if (!serverConnected) {
        matchSaveState.innerText = "RESULT: OFFLINE";
        matchSaveState.dataset.state = "offline";
        return;
      }

      if (data.currentMatchSaved) {
        matchSaveState.innerText = "RESULT: SAVED";
        matchSaveState.dataset.state = "saved";
        return;
      }

      if (timeElapsed >= matchDuration) {
        matchSaveState.innerText = "RESULT: AUTO";
        matchSaveState.dataset.state = "saved";
        return;
      }

      matchSaveState.innerText = "RESULT: WAITING";
      matchSaveState.dataset.state = "waiting";
    }

    function parseShotTimeForResult(value) {
      const match = String(value || "").trim().match(/^(\d+)[.:](\d{2})$/);
      if (!match) return null;

      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return null;

      return minutes * 60 + seconds;
    }

    function cleanWeight(value) {
      if (value === "" || value === null || value === undefined) return null;

      const weight = Number(value);
      if (!Number.isFinite(weight) || weight <= 0) return null;

      const roundedWeight = Math.round(weight * 10) / 10;
      return roundedWeight > 0 ? roundedWeight : null;
    }

    function formatWeight(value) {
      const weight = cleanWeight(value);
      return weight === null ? "-" : `${weight.toFixed(1)} kg`;
    }

    function getWinnerLabel(result) {
      if (!result) return "เสมอ";

      const resultScoreA = Number(result.scoreA) || 0;
      const resultScoreB = Number(result.scoreB) || 0;

      if (resultScoreA > resultScoreB) return result.teamNameA || "TEAM A";
      if (resultScoreB > resultScoreA) return result.teamNameB || "TEAM B";

      const shotSecondsA = parseShotTimeForResult(result.shotA);
      const shotSecondsB = parseShotTimeForResult(result.shotB);

      if (shotSecondsA !== null && shotSecondsB !== null) {
        if (shotSecondsA < shotSecondsB) return result.teamNameA || "TEAM A";
        if (shotSecondsB < shotSecondsA) return result.teamNameB || "TEAM B";
      }

      const resultWeightA = cleanWeight(result.teamWeightA);
      const resultWeightB = cleanWeight(result.teamWeightB);
      const shotTimesAreEqual = shotSecondsA !== null && shotSecondsB !== null && shotSecondsA === shotSecondsB;

      if (shotTimesAreEqual && resultWeightA !== null && resultWeightB !== null) {
        if (resultWeightA < resultWeightB) return result.teamNameA || "TEAM A";
        if (resultWeightB < resultWeightA) return result.teamNameB || "TEAM B";
      }

      return "เสมอ";
    }

    function appendTextCell(row, text) {
      const cell = document.createElement("td");
      cell.innerText = text;
      row.appendChild(cell);
      return cell;
    }

    function normalizeMissionTimes(value) {
      const missionTimes = Array.isArray(value) ? value : [];
      return [0, 1, 2, 3].map((index) => missionTimes[index] || "--.--");
    }

    function appendMissionCell(row, missionTimes) {
      const cell = document.createElement("td");
      cell.className = "mission-history-cell";
      const grid = document.createElement("div");
      grid.className = "mission-history-grid";

      normalizeMissionTimes(missionTimes).forEach((time, index) => {
        const item = document.createElement("div");
        item.className = "mission-history-item";
        const label = document.createElement("span");
        label.className = "mission-history-label";
        label.innerText = `ภ.${index + 1}`;
        const value = document.createElement("span");
        value.className = time === "--.--" ? "mission-history-time empty" : "mission-history-time";
        value.innerText = time;
        item.appendChild(label);
        item.appendChild(value);
        grid.appendChild(item);
      });

      cell.appendChild(grid);
      row.appendChild(cell);
      return cell;
    }

    function printMatchResults(resultId) {
      const printableResults = resultId
        ? matchResults.filter((result) => result.id === resultId)
        : matchResults;

      if (printableResults.length === 0) {
        showResultStatus("ยังไม่มีประวัติการแข่งขันสำหรับบันทึก PDF", "waiting");
        return;
      }

      const reportWindow = window.open("", "_blank");
      if (!reportWindow) {
        showResultStatus("กรุณาอนุญาต popup เพื่อเปิดรายงาน PDF", "waiting");
        return;
      }

      const reportDocument = reportWindow.document;
      reportDocument.open();
      reportDocument.write("<!DOCTYPE html><html lang=\"th\"><head><meta charset=\"UTF-8\"><title>รายงานผลการแข่งขัน</title></head><body></body></html>");
      reportDocument.close();

      const style = reportDocument.createElement("style");
      style.textContent = `
        @page { size: A4 landscape; margin: 12mm; }
        body { margin: 0; color: #111; font-family: Arial, "Noto Sans Thai", sans-serif; }
        h1 { margin: 0 0 6px; font-size: 22px; }
        p { margin: 0 0 14px; color: #444; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 7px 8px; border: 1px solid #999; font-size: 11px; line-height: 1.25; text-align: left; vertical-align: middle; }
        th { background: #e8eef7; font-weight: 800; white-space: nowrap; }
        .score-pill { font-weight: 800; white-space: nowrap; }
        .mission-history-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
        .mission-history-item { display: flex; gap: 4px; white-space: nowrap; }
        .mission-history-label, .mission-history-time { font-weight: 800; }
      `;
      reportDocument.head.appendChild(style);

      const heading = reportDocument.createElement("h1");
      heading.innerText = "รายงานผลการแข่งขัน ROBOT CONTEST";
      reportDocument.body.appendChild(heading);

      const generatedAt = reportDocument.createElement("p");
      generatedAt.innerText = `จำนวน ${printableResults.length} รายการ | สร้างรายงาน ${new Date().toLocaleString("th-TH")}`;
      reportDocument.body.appendChild(generatedAt);

      const printableTable = reportDocument.importNode(matchHistoryTable, true);
      printableTable.removeAttribute("id");
      printableTable.hidden = false;
      printableTable.querySelectorAll("th:last-child, td:last-child").forEach((cell) => cell.remove());
      if (resultId) {
        printableTable.querySelectorAll("tbody tr").forEach((row) => {
          if (row.dataset.resultId !== resultId) row.remove();
        });
      }
      reportDocument.body.appendChild(printableTable);

      reportWindow.opener = null;
      reportWindow.addEventListener("afterprint", () => reportWindow.close());
      setTimeout(() => {
        reportWindow.focus();
        reportWindow.print();
      }, 150);
    }

    function renderHistory(results) {
      matchResults = Array.isArray(results) ? results : [];
      historyCount.innerText = `${matchResults.length} รายการ`;
      pdfDownloadButton.disabled = matchResults.length === 0;
      matchHistoryBody.innerHTML = "";

      const hasHistory = matchResults.length > 0;
      matchHistoryTable.hidden = !hasHistory;
      emptyHistory.hidden = hasHistory;

      matchResults.forEach((result) => {
        const row = document.createElement("tr");
        row.dataset.resultId = result.id || "";
        appendTextCell(row, result.matchNumber || "-");
        appendTextCell(row, result.teamNameA || "TEAM A");
        appendTextCell(row, formatWeight(result.teamWeightA));
        appendTextCell(row, result.shotA || "--.--");
        appendMissionCell(row, result.missionShotsA);

        const scoreCell = document.createElement("td");
        const scorePill = document.createElement("span");
        scorePill.className = "score-pill";
        scorePill.innerText = `${Number(result.scoreA) || 0} - ${Number(result.scoreB) || 0}`;
        scoreCell.appendChild(scorePill);
        row.appendChild(scoreCell);

        appendTextCell(row, result.teamNameB || "TEAM B");
        appendTextCell(row, formatWeight(result.teamWeightB));
        appendTextCell(row, result.shotB || "--.--");
        appendMissionCell(row, result.missionShotsB);
        appendTextCell(row, getWinnerLabel(result));

        appendTextCell(row, formatSavedAt(result.savedAt));

        const actionCell = document.createElement("td");
        actionCell.className = "history-action-cell";
        const actionButtons = document.createElement("div");
        actionButtons.className = "history-row-actions";
        const printButton = document.createElement("button");
        printButton.className = "history-print-button";
        printButton.type = "button";
        printButton.dataset.resultId = result.id || "";
        printButton.disabled = !result.id;
        printButton.innerText = "พิมพ์";
        const deleteButton = document.createElement("button");
        deleteButton.className = "history-delete-button";
        deleteButton.type = "button";
        deleteButton.dataset.resultId = result.id || "";
        deleteButton.disabled = !serverConnected || !result.id;
        deleteButton.innerText = "ลบ";
        actionButtons.appendChild(printButton);
        actionButtons.appendChild(deleteButton);
        actionCell.appendChild(actionButtons);
        row.appendChild(actionCell);

        matchHistoryBody.appendChild(row);
      });
    }

    function renderResultPanel(data) {
      const timeElapsed = Number(data.timeElapsed) || 0;
      const matchDuration = Number(data.matchDuration) || 180;
      const teamNameA = data.teamNameA || "TEAM A";
      const teamNameB = data.teamNameB || "TEAM B";

      document.getElementById("resultTeamA").innerText = teamNameA;
      document.getElementById("resultTeamB").innerText = teamNameB;
      document.getElementById("resultScoreA").innerText = Number(data.scoreA) || 0;
      document.getElementById("resultScoreB").innerText = Number(data.scoreB) || 0;
      document.getElementById("resultShotA").innerText = data.shotA || "--.--";
      document.getElementById("resultShotB").innerText = data.shotB || "--.--";
      document.getElementById("resultWeightA").innerText = formatWeight(data.teamWeightA);
      document.getElementById("resultWeightB").innerText = formatWeight(data.teamWeightB);
      document.getElementById("resultTime").innerText = data.time || formatClock(timeElapsed);
      document.getElementById("resultStatus").innerText = data.status || "STOP";

      if (data.currentMatchSaved) {
        showResultStatus("บันทึกผลคู่นี้แล้ว ดูรายการล่าสุดได้ในตารางย้อนหลัง", "saved");
      } else if (timeElapsed >= matchDuration) {
        showResultStatus("ครบเวลา 3 นาที ระบบจะบันทึกผลให้อัตโนมัติ", "saved");
      } else {
        showResultStatus("รอครบ 3 นาที ระบบจะบันทึกผลอัตโนมัติ", "waiting");
      }

      updateMatchSaveState(data);
      renderHistory(data.matchResults);
    }

    socket.on("connect", () => {
      serverConnected = true;
    });

    socket.on("disconnect", () => {
      serverConnected = false;
      matchSaveState.innerText = "RESULT: OFFLINE";
      matchSaveState.dataset.state = "offline";
      renderHistory(matchResults);
    });

    socket.on("update", (data) => {
      serverConnected = true;
      document.getElementById("scoreA").innerText = data.scoreA;
      document.getElementById("scoreB").innerText = data.scoreB;
      document.getElementById("teamNameA").innerText = data.teamNameA || "TEAM A";
      document.getElementById("teamNameB").innerText = data.teamNameB || "TEAM B";
      document.getElementById("time").innerText = data.time;
      document.getElementById("shotA").innerText = data.shotA || "--.--";
      document.getElementById("shotB").innerText = data.shotB || "--.--";
      document.getElementById("status").innerText = data.status;
      document.getElementById("resetScoreButton").disabled = data.status === "RUNNING";
      renderResultPanel(data);
      if (typeof applyFinalWarning === "function") applyFinalWarning(data);
    });

    matchHistoryBody.addEventListener("click", (event) => {
      const printButton = event.target.closest(".history-print-button");
      if (printButton && !printButton.disabled) {
        printMatchResults(printButton.dataset.resultId);
        return;
      }

      const deleteButton = event.target.closest(".history-delete-button");
      if (!deleteButton || deleteButton.disabled) return;

      const resultId = deleteButton.dataset.resultId;
      const result = matchResults.find((matchResult) => matchResult.id === resultId);
      const matchLabel = result
        ? `คู่ที่ ${result.matchNumber || "-"} (${result.teamNameA || "TEAM A"} vs ${result.teamNameB || "TEAM B"})`
        : "รายการนี้";

      if (!window.confirm(`ลบ${matchLabel}?`)) return;

      deleteButton.disabled = true;
      showResultStatus("กำลังลบรายการ...", "waiting");

      socket.emit("match-result-delete", { id: resultId }, (response) => {
        if (response && response.deleted) {
          showResultStatus("ลบรายการย้อนหลังแล้ว", "saved");
        } else {
          showResultStatus("ไม่พบรายการที่ต้องการลบ", "waiting");
        }
      });
    });

    pdfDownloadButton.addEventListener("click", () => printMatchResults());
