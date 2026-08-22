import { render } from "preact";
import { useRef, useState } from "preact/hooks";
import { ExternalStore, EMPTY_SCOREBOARD, useExternalStore } from "../../core/store";
import { createOperatorRealtime, type CommandClient } from "../../core/realtime";
import { BrandHeader, MatchClock, Panel, ScoreSummary } from "../../shared/components";
import { useFinalWarning, unlockWarningAudio } from "../../shared/final-warning";
import { MatchHistory, ResultReview } from "../../features/results/ResultComponents";

const store = new ExternalStore(EMPTY_SCOREBOARD);
const { commands } = createOperatorRealtime("control", store);

function HoldResetAll({ commands, disabled, feedback }: { commands: CommandClient; disabled: boolean; feedback: (text: string) => void }) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }
  function begin(event: PointerEvent) {
    if (disabled) return;
    event.preventDefault();
    setHolding(true);
    timer.current = window.setTimeout(async () => {
      const reply = await commands.resetAll();
      feedback(reply.ok ? "RESET ALL สำเร็จ พร้อมคู่ใหม่" : `ไม่สำเร็จ: ${reply.code || "UNKNOWN"}`);
      cancel();
    }, 1800);
  }
  return <button id="resetAllButton" class="red" type="button" disabled={disabled} onPointerDown={begin} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel}>{holding ? "กำลังกดค้าง..." : "กดค้าง RESET ALL"}</button>;
}

function ControlApp() {
  const { value: state, connected } = useExternalStore(store);
  const [message, setMessage] = useState("พร้อมใช้งาน");
  const warning = useFinalWarning(state);
  const running = state.status === "RUNNING";
  const active = running || state.status === "PAUSED";
  const reviewPending = state.status === "FINISH" && !state.resultLocked;

  async function run(label: string, action: () => Promise<any>) {
    const reply = await action();
    setMessage(reply && reply.ok ? `${label}: สำเร็จ` : `${label}: ${reply && reply.code || "ไม่สำเร็จ"}`);
  }

  return <main class="control-shell"><BrandHeader title="VEC Service Intelligence Robot" subtitle="CONTROL PANEL" connected={connected} /><nav class="quick-links"><a href="/teams">TEAM NAME SETUP</a><a href="/status">FIELD STATUS</a><a href="/overlay/main" target="_blank" rel="noreferrer">OBS OVERLAY</a></nav><div class="control-grid"><Panel className="live-panel"><div class="result-board"><ScoreSummary side="A" name={state.teamNameA} school={state.teamSchoolA} score={state.scoreA} shot={state.shotA} /><div class={warning ? "final-warning" : ""}><MatchClock time={state.time} status={state.status} /></div><ScoreSummary side="B" name={state.teamNameB} school={state.teamSchoolB} score={state.scoreB} shot={state.shotB} /></div></Panel><Panel title="ควบคุมเวลา"><div class="button-row"><button class="green" id="startTimeButton" type="button" disabled={!connected || running || state.status === "FINISH"} onClick={() => { unlockWarningAudio(); void run("START", () => commands.start()); }}>เริ่ม</button><button class="red" id="stopTimeButton" type="button" disabled={!connected || !running} onClick={() => void run("STOP", () => commands.stop())}>หยุด</button></div></Panel><Panel title="ระบบ / รีเซ็ต"><div class="button-row"><button class="gray" id="resetScoreButton" type="button" disabled={!connected || active || reviewPending} onClick={() => { if (window.confirm("ยืนยันรีเซ็ตคะแนน/SHOT ของคู่ปัจจุบัน?")) void run("RESET SCORE", () => commands.resetScore()); }}>RESET SCORE / SHOT</button><button class="blue" id="forceSyncButton" type="button" disabled={!connected} onClick={() => void run("SYNC", () => commands.forceSync())}>SYNC SCREENS / OBS</button><HoldResetAll commands={commands} disabled={!connected || active || reviewPending} feedback={setMessage} /></div></Panel><div class="result-message">{message}</div><ResultReview state={state} commands={commands} /><Panel title="ประวัติผลย้อนหลัง" className="result-section"><MatchHistory results={state.matchResults} connected={connected} commands={commands} /></Panel></div></main>;
}

const root = document.getElementById("app");
if (root) render(<ControlApp />, root);
