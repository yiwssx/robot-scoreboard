(function () {
  "use strict";

  if (typeof io !== "function") return;

  const page = (window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/");
  const isControlPage = page === "/control" || page.endsWith("/control.html");
  const isTeamAPage = page === "/team/a" || page.endsWith("/team-a.html");
  const isTeamBPage = page === "/team/b" || page.endsWith("/team-b.html");
  const isTeamPage = isTeamAPage || isTeamBPage;
  const isTeamsPage = page === "/teams" || page.endsWith("/team-names.html");
  const safetySocket = io();
  let latest = null;
  let toastTimer = null;

  const errorLabels = {
    MATCH_NOT_RUNNING: "ทำรายการไม่ได้: การแข่งขันยังไม่ได้ RUNNING",
    MATCH_ACTIVE: "ทำรายการไม่ได้: คู่แข่งขันกำลัง RUNNING/PAUSED",
    RESULT_NOT_LOCKED: "กรุณายืนยันผลการแข่งขันก่อนเริ่มคู่ใหม่",
    RESULT_LOCKED: "ผลการแข่งขันถูกยืนยันและล็อกแล้ว",
    SAME_TEAM_BOTH_SIDES: "TEAM A และ TEAM B ต้องเป็นคนละทีม",
    TEAM_NAME_ALREADY_EXISTS: "มีชื่อทีมนี้อยู่แล้ว",
    MATCH_NOT_READY: "แก้ข้อมูลทีมได้เฉพาะสถานะ READY",
    MISSION_ALREADY_RECORDED: "ภารกิจนี้ถูกบันทึกแล้ว",
    INVALID_TIME: "รูปแบบเวลาต้องเป็น MM.SS และไม่เกินเวลาการแข่งขัน",
    MATCH_FINISHED: "การแข่งขันจบแล้ว กรุณาแก้ไขผ่าน RESULT REVIEW",
  };

  function toast(message, type) {
    let box = document.getElementById("fieldSafetyToast");
    if (!box) {
      box = document.createElement("div");
      box.id = "fieldSafetyToast";
      Object.assign(box.style, {
        position: "fixed",
        right: "18px",
        bottom: "18px",
        zIndex: "99999",
        maxWidth: "min(92vw, 520px)",
        padding: "14px 18px",
        borderRadius: "10px",
        color: "white",
        font: "700 16px/1.35 Arial, sans-serif",
        boxShadow: "0 10px 30px rgba(0,0,0,.35)",
      });
      document.body.appendChild(box);
    }
    box.style.background = type === "error" ? "#b42318" : type === "ok" ? "#16794a" : "#264a73";
    box.textContent = message;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  function explain(code) {
    return errorLabels[code] || `ไม่สามารถทำรายการได้ (${code || "UNKNOWN"})`;
  }

  function scoringButtons() {
    return Array.from(document.querySelectorAll("[data-score], [data-mission], [data-shot-mission], #endMatchButton"));
  }

  function enforceTeamScoringState() {
    if (!latest || !isTeamPage) return;
    const running = latest.status === "RUNNING";
    scoringButtons().forEach((button) => { button.disabled = !running; });
  }

  function makeTeamPageScoringOnly() {
    if (!isTeamPage) return;

    const timerGrid = document.querySelector(".timer-grid");
    if (timerGrid) timerGrid.remove();
    const resetButton = document.getElementById("resetScoreButton");
    if (resetButton) resetButton.remove();

    const note = document.createElement("div");
    note.textContent = "SCORING ONLY • START / STOP / RESET ใช้ที่ CONTROL PANEL";
    Object.assign(note.style, {
      margin: "10px auto 14px",
      maxWidth: "780px",
      padding: "9px 12px",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "8px",
      background: "rgba(255,255,255,.08)",
      color: "#fff8d6",
      font: "800 14px/1.3 Arial, sans-serif",
      textAlign: "center",
    });
    const panel = document.querySelector("main.panel");
    if (panel) panel.insertBefore(note, panel.children[2] || null);

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-score], [data-mission], [data-shot-mission], #endMatchButton");
      if (!button || !latest || latest.status === "RUNNING") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toast("บันทึกคะแนนได้เฉพาะตอน RUNNING", "error");
    }, true);

    const observer = new MutationObserver(enforceTeamScoringState);
    scoringButtons().forEach((button) => observer.observe(button, { attributes: true, attributeFilter: ["disabled"] }));
  }

  function findButtonByText(text) {
    return Array.from(document.querySelectorAll("button")).find((button) => button.textContent.trim().includes(text));
  }

  function replaceWithSafeResetScore() {
    const original = document.getElementById("resetScoreButton");
    if (!original) return null;
    const button = original.cloneNode(true);
    button.removeAttribute("onclick");
    original.replaceWith(button);
    button.addEventListener("click", () => {
      if (!window.confirm("ยืนยันรีเซ็ตคะแนน/SHOT ของคู่ปัจจุบัน?")) return;
      safetySocket.emit("reset-score", (response) => {
        if (response && response.ok) toast("รีเซ็ตคู่แข่งขันแล้ว", "ok");
        else toast(explain(response && response.code), "error");
      });
    });
    return button;
  }

  function replaceWithHoldResetAll() {
    const original = findButtonByText("รีเซ็ตทั้งหมด");
    if (!original) return null;
    const button = original.cloneNode(true);
    button.removeAttribute("onclick");
    button.textContent = "กดค้าง 2 วิ RESET ALL";
    original.replaceWith(button);

    let holdTimer = null;
    let fired = false;
    function cancelHold() {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      if (!fired) button.textContent = "กดค้าง 2 วิ RESET ALL";
      fired = false;
    }
    function beginHold(event) {
      if (button.disabled) return;
      event.preventDefault();
      fired = false;
      button.textContent = "กำลังกดค้าง...";
      holdTimer = setTimeout(() => {
        fired = true;
        holdTimer = null;
        safetySocket.emit("reset-all", (response) => {
          if (response && response.ok) toast("RESET ALL สำเร็จ พร้อมคู่ใหม่", "ok");
          else toast(explain(response && response.code), "error");
          button.textContent = "กดค้าง 2 วิ RESET ALL";
        });
      }, 1800);
    }
    button.addEventListener("pointerdown", beginHold);
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => button.addEventListener(name, cancelHold));
    return button;
  }

  function buildResultReview() {
    if (!isControlPage || document.getElementById("fieldResultReview")) return null;
    const section = document.createElement("section");
    section.id = "fieldResultReview";
    section.className = "box result-section";
    section.innerHTML = `
      <style>
        #fieldResultReview { text-align:left; border:1px solid rgba(255,204,0,.28); border-radius:10px; margin-top:16px; }
        #fieldResultReview[hidden] { display:none !important; }
        .fs-head { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:center; }
        .fs-badge { padding:7px 11px; border-radius:999px; background:#6f4d00; color:#fff4bf; font-weight:900; }
        .fs-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:12px; }
        .fs-card { padding:12px; border:1px solid rgba(255,255,255,.13); border-radius:8px; background:rgba(0,0,0,.18); }
        .fs-card h3 { margin:0 0 10px; color:#fff; }
        .fs-row { display:flex; flex-wrap:wrap; gap:7px; margin:8px 0; align-items:center; }
        .fs-row button { min-width:72px; min-height:42px; padding:8px 12px; font-size:16px; }
        .fs-row input,.fs-row select { min-height:42px; padding:8px; font-size:16px; border-radius:6px; }
        .fs-current { color:#ffe072; font-weight:800; }
        #fsFinalize { width:100%; min-height:54px; margin-top:12px; background:#16794a; font-size:20px; }
        @media(max-width:760px){.fs-grid{grid-template-columns:1fr;}}
      </style>
      <div class="fs-head"><h2>RESULT REVIEW / CORRECTION</h2><div class="fs-badge" id="fsReviewBadge">WAITING</div></div>
      <div class="fs-grid">
        <div class="fs-card" data-side="A"><h3 id="fsNameA">TEAM A</h3><div class="fs-current" id="fsCurrentA"></div>
          <div class="fs-row" data-score-side="A"></div>
          <div class="fs-row"><label>SHOT</label><input id="fsShotA" placeholder="MM.SS"><button data-apply-shot="A">บันทึก SHOT</button></div>
          <div class="fs-row"><label>ภารกิจ</label><select id="fsMissionA"><option>1</option><option>2</option><option>3</option><option>4</option></select><input id="fsMissionTimeA" placeholder="MM.SS"><button data-apply-mission="A">แก้เวลา</button></div>
        </div>
        <div class="fs-card" data-side="B"><h3 id="fsNameB">TEAM B</h3><div class="fs-current" id="fsCurrentB"></div>
          <div class="fs-row" data-score-side="B"></div>
          <div class="fs-row"><label>SHOT</label><input id="fsShotB" placeholder="MM.SS"><button data-apply-shot="B">บันทึก SHOT</button></div>
          <div class="fs-row"><label>ภารกิจ</label><select id="fsMissionB"><option>1</option><option>2</option><option>3</option><option>4</option></select><input id="fsMissionTimeB" placeholder="MM.SS"><button data-apply-mission="B">แก้เวลา</button></div>
        </div>
      </div>
      <button id="fsFinalize" type="button">ยืนยันผลการแข่งขันและล็อกผล</button>
    `;
    const anchor = document.querySelector(".result-section:last-of-type") || document.querySelector(".control-grid") || document.querySelector("main");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor.nextSibling);

    const deltas = [-20, -10, 10, 20];
    ["A", "B"].forEach((side) => {
      const row = section.querySelector(`[data-score-side="${side}"]`);
      deltas.forEach((delta) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = delta > 0 ? `+${delta}` : String(delta);
        button.dataset.correctScore = side;
        button.dataset.delta = String(delta);
        button.style.background = delta > 0 ? "#16794a" : "#b42318";
        row.appendChild(button);
      });
    });

    section.addEventListener("click", (event) => {
      const scoreButton = event.target.closest("[data-correct-score]");
      if (scoreButton) {
        safetySocket.emit("result-correction", {
          type: "score",
          team: scoreButton.dataset.correctScore,
          delta: Number(scoreButton.dataset.delta),
        }, correctionReply);
        return;
      }
      const shotButton = event.target.closest("[data-apply-shot]");
      if (shotButton) {
        const side = shotButton.dataset.applyShot;
        safetySocket.emit("result-correction", { type: "shot", team: side, value: document.getElementById(`fsShot${side}`).value }, correctionReply);
        return;
      }
      const missionButton = event.target.closest("[data-apply-mission]");
      if (missionButton) {
        const side = missionButton.dataset.applyMission;
        safetySocket.emit("result-correction", {
          type: "mission-shot",
          team: side,
          mission: Number(document.getElementById(`fsMission${side}`).value),
          value: document.getElementById(`fsMissionTime${side}`).value,
        }, correctionReply);
      }
    });

    section.querySelector("#fsFinalize").addEventListener("click", () => {
      if (!window.confirm("ยืนยันผลคู่นี้? หลังยืนยันให้ใช้การแก้ไขเฉพาะกรณีจำเป็นโดยเริ่มกระบวนการใหม่")) return;
      safetySocket.emit("result-finalize", (response) => {
        if (response && response.ok) toast("ยืนยันและล็อกผลการแข่งขันแล้ว", "ok");
        else toast(explain(response && response.code), "error");
      });
    });
    return section;
  }

  function correctionReply(response) {
    if (response && response.ok) toast("แก้ไขผลการแข่งขันแล้ว", "ok");
    else toast(explain(response && response.code), "error");
  }

  let safeResetScore = null;
  let safeResetAll = null;
  let reviewPanel = null;

  function updateControlSafety(data) {
    if (!isControlPage) return;
    const running = data.status === "RUNNING";
    const active = running || data.status === "PAUSED";
    const reviewPending = data.status === "FINISH" && !data.resultLocked;

    const start = document.querySelector('[onclick="startTime()"]');
    const stop = document.querySelector('[onclick="stopTime()"]');
    if (start) start.disabled = running || data.status === "FINISH";
    if (stop) stop.disabled = !running;
    if (safeResetScore) safeResetScore.disabled = active || reviewPending;
    if (safeResetAll) safeResetAll.disabled = active || reviewPending;

    if (reviewPanel) {
      reviewPanel.hidden = data.status !== "FINISH";
      const locked = Boolean(data.resultLocked);
      reviewPanel.querySelector("#fsReviewBadge").textContent = locked ? "LOCKED" : "REVIEW REQUIRED";
      reviewPanel.querySelector("#fsReviewBadge").style.background = locked ? "#16794a" : "#6f4d00";
      reviewPanel.querySelector("#fsNameA").textContent = data.teamNameA || "TEAM A";
      reviewPanel.querySelector("#fsNameB").textContent = data.teamNameB || "TEAM B";
      reviewPanel.querySelector("#fsCurrentA").textContent = `คะแนน ${data.scoreA} | SHOT ${data.shotA || "--.--"}`;
      reviewPanel.querySelector("#fsCurrentB").textContent = `คะแนน ${data.scoreB} | SHOT ${data.shotB || "--.--"}`;
      reviewPanel.querySelectorAll("button,input,select").forEach((control) => { control.disabled = locked; });
    }
  }

  function enforceDistinctTeamOptions(data) {
    if (!isTeamsPage) return;
    const selectA = document.getElementById("teamASelect");
    const selectB = document.getElementById("teamBSelect");
    if (selectA && selectB) {
      Array.from(selectA.options).forEach((option) => { option.disabled = option.value === data.teamNameB; });
      Array.from(selectB.options).forEach((option) => { option.disabled = option.value === data.teamNameA; });
    }

    const ready = data.status === "READY";
    document.querySelectorAll(
      "#teamASelect, #teamBSelect, #addTeamForm input, #addTeamForm button, #editTeamForm input, #editTeamForm select, #editTeamForm button"
    ).forEach((control) => { control.disabled = !ready; });
  }

  function initialize() {
    makeTeamPageScoringOnly();
    if (isControlPage) {
      safeResetScore = replaceWithSafeResetScore();
      safeResetAll = replaceWithHoldResetAll();
      reviewPanel = buildResultReview();
      if (reviewPanel) reviewPanel.hidden = true;
    }
  }

  safetySocket.on("connect", () => safetySocket.emit("force-sync"));
  safetySocket.on("update", (data) => {
    latest = data;
    enforceTeamScoringState();
    updateControlSafety(data);
    enforceDistinctTeamOptions(data);
  });
  safetySocket.on("action-error", (payload) => toast(explain(payload && payload.code), "error"));
  safetySocket.on("operator-notice", (payload) => toast(explain(payload && payload.code), "error"));

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
