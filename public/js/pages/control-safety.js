"use strict";

(function initializeControlSafety() {
  if (typeof io !== "function") return;

  const notify = window.ScoreboardNotifications || {
    toast() {},
    explain(code) { return code || "UNKNOWN"; },
  };
  const safetySocket = io();
  let latest = null;

  function replaceResetScore() {
    const original = document.getElementById("resetScoreButton");
    if (!original) return null;
    const button = original.cloneNode(true);
    original.replaceWith(button);
    button.addEventListener("click", () => {
      if (!window.confirm("ยืนยันรีเซ็ตคะแนน/SHOT ของคู่ปัจจุบัน?")) return;
      safetySocket.emit("reset-score", (response) => {
        if (response && response.ok) notify.toast("รีเซ็ตคู่แข่งขันแล้ว", "ok");
        else notify.toast(notify.explain(response && response.code), "error");
      });
    });
    return button;
  }

  function replaceResetAll() {
    const original = document.getElementById("resetAllButton");
    if (!original) return null;
    const button = original.cloneNode(true);
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
          if (response && response.ok) notify.toast("RESET ALL สำเร็จ พร้อมคู่ใหม่", "ok");
          else notify.toast(notify.explain(response && response.code), "error");
          button.textContent = "กดค้าง 2 วิ RESET ALL";
        });
      }, 1800);
    }

    button.addEventListener("pointerdown", beginHold);
    ["pointerup", "pointerleave", "pointercancel"].forEach((name) => button.addEventListener(name, cancelHold));
    return button;
  }

  function correctionReply(response) {
    if (response && response.ok) notify.toast("แก้ไขผลการแข่งขันแล้ว", "ok");
    else notify.toast(notify.explain(response && response.code), "error");
  }

  function buildResultReview() {
    if (document.getElementById("fieldResultReview")) return document.getElementById("fieldResultReview");

    const section = document.createElement("section");
    section.id = "fieldResultReview";
    section.className = "box result-section";
    section.innerHTML = `
      <div class="fs-head">
        <h2>RESULT REVIEW / CORRECTION</h2>
        <div class="fs-badge" id="fsReviewBadge">WAITING</div>
      </div>
      <div class="fs-grid">
        <div class="fs-card" data-side="A">
          <h3 id="fsNameA">TEAM A</h3>
          <div class="fs-current" id="fsCurrentA"></div>
          <div class="fs-row" data-score-side="A"></div>
          <div class="fs-row">
            <label>SHOT</label>
            <input id="fsShotA" placeholder="MM.SS">
            <button data-apply-shot="A" type="button">บันทึก SHOT</button>
          </div>
          <div class="fs-row">
            <label>ภารกิจ</label>
            <select id="fsMissionA"><option>1</option><option>2</option><option>3</option><option>4</option></select>
            <input id="fsMissionTimeA" placeholder="MM.SS">
            <button data-apply-mission="A" type="button">แก้เวลา</button>
          </div>
        </div>
        <div class="fs-card" data-side="B">
          <h3 id="fsNameB">TEAM B</h3>
          <div class="fs-current" id="fsCurrentB"></div>
          <div class="fs-row" data-score-side="B"></div>
          <div class="fs-row">
            <label>SHOT</label>
            <input id="fsShotB" placeholder="MM.SS">
            <button data-apply-shot="B" type="button">บันทึก SHOT</button>
          </div>
          <div class="fs-row">
            <label>ภารกิจ</label>
            <select id="fsMissionB"><option>1</option><option>2</option><option>3</option><option>4</option></select>
            <input id="fsMissionTimeB" placeholder="MM.SS">
            <button data-apply-mission="B" type="button">แก้เวลา</button>
          </div>
        </div>
      </div>
      <button id="fsFinalize" type="button">ยืนยันผลการแข่งขันและล็อกผล</button>
    `;

    const anchor = document.querySelector(".result-section:last-of-type") || document.querySelector(".control-grid") || document.querySelector("main");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor.nextSibling);

    [-20, -10, 10, 20].forEach((delta) => {
      ["A", "B"].forEach((side) => {
        const row = section.querySelector(`[data-score-side="${side}"]`);
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
        safetySocket.emit("result-correction", {
          type: "shot",
          team: side,
          value: document.getElementById(`fsShot${side}`).value,
        }, correctionReply);
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
      if (!window.confirm("ยืนยันผลคู่นี้? หลังยืนยันผลจะถูกล็อก")) return;
      safetySocket.emit("result-finalize", (response) => {
        if (response && response.ok) notify.toast("ยืนยันและล็อกผลการแข่งขันแล้ว", "ok");
        else notify.toast(notify.explain(response && response.code), "error");
      });
    });

    return section;
  }

  const resetScoreButton = replaceResetScore();
  const resetAllButton = replaceResetAll();
  const reviewPanel = buildResultReview();
  reviewPanel.hidden = true;

  function renderSafetyState(data) {
    latest = data;
    const running = data.status === "RUNNING";
    const active = running || data.status === "PAUSED";
    const reviewPending = data.status === "FINISH" && !data.resultLocked;

    const startButton = document.getElementById("startTimeButton");
    const stopButton = document.getElementById("stopTimeButton");
    if (startButton) startButton.disabled = running || data.status === "FINISH";
    if (stopButton) stopButton.disabled = !running;
    if (resetScoreButton) resetScoreButton.disabled = active || reviewPending;
    if (resetAllButton) resetAllButton.disabled = active || reviewPending;

    reviewPanel.hidden = data.status !== "FINISH";
    if (reviewPanel.hidden) return;

    const locked = Boolean(data.resultLocked);
    const badge = reviewPanel.querySelector("#fsReviewBadge");
    badge.textContent = locked ? "LOCKED" : "REVIEW REQUIRED";
    badge.style.background = locked ? "#16794a" : "#6f4d00";
    reviewPanel.querySelector("#fsNameA").textContent = data.teamNameA || "TEAM A";
    reviewPanel.querySelector("#fsNameB").textContent = data.teamNameB || "TEAM B";
    reviewPanel.querySelector("#fsCurrentA").textContent = `คะแนน ${data.scoreA} | SHOT ${data.shotA || "--.--"}`;
    reviewPanel.querySelector("#fsCurrentB").textContent = `คะแนน ${data.scoreB} | SHOT ${data.shotB || "--.--"}`;
    reviewPanel.querySelectorAll("button,input,select").forEach((control) => { control.disabled = locked; });
  }

  safetySocket.on("connect", () => safetySocket.emit("force-sync"));
  safetySocket.on("update", renderSafetyState);

  void latest;
})();
