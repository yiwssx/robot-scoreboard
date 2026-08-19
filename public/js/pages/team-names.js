"use strict";

const teamASelect = document.getElementById("teamASelect");
    const teamBSelect = document.getElementById("teamBSelect");
    const editTeamSelect = document.getElementById("editTeamSelect");
    const editTeamName = document.getElementById("editTeamName");
    const editTeamSchool = document.getElementById("editTeamSchool");
    const editTeamWeight = document.getElementById("editTeamWeight");
    const addTeamName = document.getElementById("addTeamName");
    const addTeamSchool = document.getElementById("addTeamSchool");
    const addTeamWeight = document.getElementById("addTeamWeight");
    const deleteTeamButton = document.getElementById("deleteTeamButton");
    const showTeamNamesButton = document.getElementById("showTeamNamesButton");
    const hideTeamNamesButton = document.getElementById("hideTeamNamesButton");
    const serverStatusLine = document.getElementById("serverStatusLine");
    const messageLine = document.getElementById("messageLine");
    const matchSaveState = document.getElementById("matchSaveState");
    const resultMessage = document.getElementById("resultMessage");
    const matchHistoryTable = document.getElementById("matchHistoryTable");
    const matchHistoryBody = document.getElementById("matchHistoryBody");
    const emptyHistory = document.getElementById("emptyHistory");
    const historyCount = document.getElementById("historyCount");
    const pdfDownloadButton = document.getElementById("pdfDownloadButton");
    const controls = document.querySelectorAll("select, input, button");

    let teamNames = ["TEAM A", "TEAM B"];
    let teamWeights = {};
    let teamSchools = {};
    let teamNameA = "TEAM A";
    let teamNameB = "TEAM B";
    let teamNamesVisible = true;
    let scoreA = 0;
    let scoreB = 0;
    let timeElapsed = 0;
    let matchDuration = 180;
    let currentMatchSaved = false;
    let matchResults = [];
    let serverConnected = false;
    let editIsDirty = false;

    function cleanName(value) {
      return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
    }

    function cleanSchool(value) {
      return String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
    }

    function formatSchool(value) {
      return cleanSchool(value) || "-";
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

    function formatWeightInput(value) {
      const weight = cleanWeight(value);
      return weight === null ? "" : weight.toFixed(1);
    }

    function setControlsEnabled(enabled) {
      controls.forEach((control) => {
        control.disabled = !enabled;
      });

      if (enabled) {
        deleteTeamButton.disabled = teamNames.length <= 1;
      }

      updateDisplayButtons();
      updateMatchSaveControls();
    }

    function setServerStatus(message, state) {
      serverStatusLine.innerText = message;
      serverStatusLine.dataset.state = state || "";
    }

    function showStatus(message, state) {
      messageLine.innerText = message;
      messageLine.dataset.state = state || "";
    }

    function updateDisplayStatus() {
      if (teamNamesVisible) {
        showStatus("กำลังแสดงชื่อทีม", "visible");
      } else {
        showStatus("หยุดแสดงแล้ว", "hidden");
      }
    }

    function updateDisplayButtons() {
      if (!serverConnected) {
        showTeamNamesButton.disabled = true;
        hideTeamNamesButton.disabled = true;
        return;
      }

      showTeamNamesButton.disabled = teamNamesVisible;
      hideTeamNamesButton.disabled = !teamNamesVisible;
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

    function updateMatchSaveControls() {
      if (!serverConnected) {
        matchSaveState.innerText = "RESULT: OFFLINE";
        matchSaveState.dataset.state = "offline";
        return;
      }

      if (currentMatchSaved) {
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
      scoreA = Number(data.scoreA) || 0;
      scoreB = Number(data.scoreB) || 0;
      timeElapsed = Number(data.timeElapsed) || 0;
      matchDuration = Number(data.matchDuration) || 180;
      currentMatchSaved = Boolean(data.currentMatchSaved);

      document.getElementById("resultTeamA").innerText = teamNameA;
      document.getElementById("resultTeamB").innerText = teamNameB;
      document.getElementById("resultScoreA").innerText = scoreA;
      document.getElementById("resultScoreB").innerText = scoreB;
      document.getElementById("resultShotA").innerText = data.shotA || "--.--";
      document.getElementById("resultShotB").innerText = data.shotB || "--.--";
      document.getElementById("resultWeightA").innerText = formatWeight(data.teamWeightA);
      document.getElementById("resultWeightB").innerText = formatWeight(data.teamWeightB);
      document.getElementById("resultTime").innerText = data.time || formatClock(timeElapsed);
      document.getElementById("resultStatus").innerText = data.status || "STOP";

      if (currentMatchSaved) {
        showResultStatus("บันทึกผลคู่นี้แล้ว ดูรายการล่าสุดได้ในตารางย้อนหลัง", "saved");
      } else if (timeElapsed >= matchDuration) {
        showResultStatus("ครบเวลา 3 นาที ระบบจะบันทึกผลให้อัตโนมัติ", "saved");
      } else {
        showResultStatus("รอครบ 3 นาที ระบบจะบันทึกผลอัตโนมัติ", "waiting");
      }

      updateMatchSaveControls();
      renderHistory(data.matchResults);
    }

    function renderOptions(select, selectedName) {
      const preferredValue = selectedName || select.value;
      select.innerHTML = "";

      teamNames.forEach((teamName) => {
        const option = document.createElement("option");
        const school = formatSchool(teamSchools[teamName]);
        option.value = teamName;
        option.innerText = `${teamName} (${school} / ${formatWeight(teamWeights[teamName])})`;
        select.appendChild(option);
      });

      if (preferredValue && teamNames.includes(preferredValue)) {
        select.value = preferredValue;
      } else {
        select.value = teamNames[0] || "";
      }
    }

    function render(data) {
      teamNames = Array.isArray(data.teamNames) && data.teamNames.length
        ? data.teamNames
        : ["TEAM A", "TEAM B"];
      teamWeights = data.teamWeights && typeof data.teamWeights === "object" ? data.teamWeights : {};
      teamSchools = data.teamSchools && typeof data.teamSchools === "object" ? data.teamSchools : {};
      teamNameA = data.teamNameA || "TEAM A";
      teamNameB = data.teamNameB || "TEAM B";
      teamNamesVisible = data.teamNamesVisible !== false;

      document.getElementById("currentTeamA").innerText = teamNameA;
      document.getElementById("currentTeamB").innerText = teamNameB;
      document.getElementById("currentTeamSchoolA").innerText = `SCHOOL ${formatSchool(data.teamSchoolA || teamSchools[teamNameA])}`;
      document.getElementById("currentTeamSchoolB").innerText = `SCHOOL ${formatSchool(data.teamSchoolB || teamSchools[teamNameB])}`;
      document.getElementById("currentTeamWeightA").innerText = `WEIGHT ${formatWeight(data.teamWeightA)}`;
      document.getElementById("currentTeamWeightB").innerText = `WEIGHT ${formatWeight(data.teamWeightB)}`;
      document.getElementById("textPreviewA").innerText = teamNamesVisible ? teamNameA : "";
      document.getElementById("textPreviewB").innerText = teamNamesVisible ? teamNameB : "";

      renderOptions(teamASelect, teamNameA);
      renderOptions(teamBSelect, teamNameB);
      renderOptions(editTeamSelect, teamNames.includes(editTeamSelect.value) ? editTeamSelect.value : teamNames[0]);

      if (!editIsDirty) {
        editTeamName.value = editTeamSelect.value || "";
        editTeamSchool.value = teamSchools[editTeamSelect.value] || "";
        editTeamWeight.value = formatWeightInput(teamWeights[editTeamSelect.value]);
      }

      deleteTeamButton.disabled = teamNames.length <= 1;
      renderResultPanel(data);
      updateDisplayStatus();
      updateDisplayButtons();
    }

    if (typeof io !== "function") {
      setServerStatus("SERVER: NO SERVER", "offline");
      showStatus("ไม่เชื่อมต่อ server", "offline");
      setControlsEnabled(false);
    } else {
      const socket = io();

      setControlsEnabled(false);

      socket.on("connect", () => {
        serverConnected = true;
        setServerStatus("SERVER: CONNECTED", "connected");
        setControlsEnabled(true);
      });

      socket.on("disconnect", () => {
        serverConnected = false;
        setServerStatus("SERVER: NO SERVER", "offline");
        showStatus("ไม่เชื่อมต่อ server", "offline");
        setControlsEnabled(false);
      });

      socket.on("connect_error", () => {
        serverConnected = false;
        setServerStatus("SERVER: NO SERVER", "offline");
        showStatus("ไม่เชื่อมต่อ server", "offline");
        setControlsEnabled(false);
      });

      socket.on("update", (data) => {
        render(data);
      });

      teamASelect.addEventListener("change", () => {
        socket.emit("team-name-select", {
          team: "A",
          name: teamASelect.value
        });
        showStatus("เลือกทีม A แล้ว");
      });

      teamBSelect.addEventListener("change", () => {
        socket.emit("team-name-select", {
          team: "B",
          name: teamBSelect.value
        });
        showStatus("เลือกทีม B แล้ว");
      });

      document.getElementById("addTeamForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const name = cleanName(addTeamName.value);
        const school = cleanSchool(addTeamSchool.value);
        const weight = cleanWeight(addTeamWeight.value);
        if (!name) {
          showStatus("กรุณาพิมพ์ชื่อทีม");
          return;
        }

        socket.emit("team-name-add", { name, school, weight });
        addTeamName.value = "";
        addTeamSchool.value = "";
        addTeamWeight.value = "";
        showStatus("เพิ่มชื่อทีมแล้ว");
      });

      editTeamSelect.addEventListener("change", () => {
        editIsDirty = false;
        editTeamName.value = editTeamSelect.value || "";
        editTeamSchool.value = teamSchools[editTeamSelect.value] || "";
        editTeamWeight.value = formatWeightInput(teamWeights[editTeamSelect.value]);
      });

      editTeamName.addEventListener("input", () => {
        editIsDirty = true;
      });

      editTeamSchool.addEventListener("input", () => {
        editIsDirty = true;
      });

      editTeamWeight.addEventListener("input", () => {
        editIsDirty = true;
      });

      document.getElementById("editTeamForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const oldName = editTeamSelect.value;
        const newName = cleanName(editTeamName.value);
        const school = cleanSchool(editTeamSchool.value);
        const weight = cleanWeight(editTeamWeight.value);
        if (!oldName || !newName) {
          showStatus("กรุณาเลือกทีมและพิมพ์ชื่อ");
          return;
        }

        socket.emit("team-name-edit", {
          oldName,
          newName,
          school,
          weight
        });
        editIsDirty = false;
        showStatus("บันทึกชื่อทีมแล้ว");
      });

      deleteTeamButton.addEventListener("click", () => {
        const name = editTeamSelect.value;
        if (!name || teamNames.length <= 1) {
          showStatus("ต้องเหลือชื่อทีมอย่างน้อย 1 ทีม");
          return;
        }

        if (!window.confirm(`ลบชื่อทีม "${name}" ?`)) return;

        socket.emit("team-name-delete", { name });
        editIsDirty = false;
        showStatus("ลบชื่อทีมแล้ว");
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

      showTeamNamesButton.addEventListener("click", () => {
        socket.emit("team-names-show");
        showStatus("กำลังแสดงชื่อทีม", "visible");
      });

      hideTeamNamesButton.addEventListener("click", () => {
        socket.emit("team-names-hide");
        showStatus("หยุดแสดงแล้ว", "hidden");
      });
    }

    pdfDownloadButton.addEventListener("click", () => printMatchResults());
