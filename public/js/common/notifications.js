"use strict";

(function initializeOperatorNotifications() {
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

  let toastTimer = null;

  function toast(message, type = "info") {
    let box = document.getElementById("operatorToast");
    if (!box) {
      box = document.createElement("div");
      box.id = "operatorToast";
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

  window.ScoreboardNotifications = Object.freeze({ toast, explain });

  if (typeof io === "function") {
    const notificationSocket = io();
    const showError = (payload) => toast(explain(payload && payload.code), "error");
    notificationSocket.on("action-error", showError);
    notificationSocket.on("operator-notice", showError);
  }
})();
