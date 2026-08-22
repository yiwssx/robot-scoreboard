import { render } from "preact";
import { ExternalStore, EMPTY_SCOREBOARD, useExternalStore } from "../../core/store";
import { createOperatorRealtime } from "../../core/realtime";
import type { TeamSide } from "../../core/contracts";
import { BrandHeader } from "../../shared/components";
import { useFinalWarning } from "../../shared/final-warning";

const side = String(document.body.dataset.team || "A").toUpperCase() as TeamSide;
const store = new ExternalStore(EMPTY_SCOREBOARD);
const { commands } = createOperatorRealtime(side === "A" ? "team-a" : "team-b", store);

function TeamApp() {
  const { value: state, connected } = useExternalStore(store);
  const warning = useFinalWarning(state);
  const score = side === "A" ? state.scoreA : state.scoreB;
  const name = side === "A" ? state.teamNameA : state.teamNameB;
  const shot = side === "A" ? state.shotA : state.shotB;
  const missionShots = side === "A" ? state.missionShotsA : state.missionShotsB;
  const recorded = side === "A" ? state.recordedMissionShotsA : state.recordedMissionShotsB;
  const running = connected && state.status === "RUNNING";
  return <main class="panel"><BrandHeader title={`TEAM ${side}`} subtitle="LIVE SCOREBOARD · SCORING ONLY" connected={connected} /><div class="top-row"><h1 class="team-tag">{name}</h1><div class="status" data-state={connected ? state.status : "NO_SERVER"}>{connected ? state.status : "NO SERVER"}</div></div><div class="scoring-only-note">SCORING ONLY • START / STOP / RESET ใช้ที่ CONTROL PANEL</div><div class="score"><span class="score-value">{score}</span><div class="mission-shot-grid">{[1,2,3,4].map((mission) => <div class="mission-shot"><span class="mission-label">ภารกิจ {mission}</span><span class="mission-time">{missionShots[mission - 1] || "--.--"}</span></div>)}</div></div><div class={`time ${warning ? "final-warning" : ""}`}>{state.time}</div><div class="shot-readout"><span class="shot-label">SHOT</span><span class="shot-time">{shot || "--.--"}</span></div><div class="mission-button-grid">{[1,2,3,4].map((mission) => <><button class={`mission-button ${mission === 4 ? "end" : ""}`} type="button" disabled={!running || (mission === 4 ? Boolean(recorded[3]) : Boolean(missionShots[mission - 1]))} onClick={() => void (mission === 4 ? commands.endWithBonus(side) : commands.missionScore(side, mission))}><span>ภารกิจ {mission}</span>+{state.rules.missions[String(mission)] || 0}{mission === 4 ? " END" : ""}</button><button class="mission-shot-button" type="button" disabled={!running || Boolean(missionShots[mission - 1])} onClick={() => void commands.missionShot(side, mission)}><span>ภารกิจ {mission}</span>SHOT</button></>)}</div><div class="button-grid">{[10,20,-10,-20].map((point) => <button type="button" class={point > 0 ? "plus" : "minus"} disabled={!running} onClick={() => void commands.addScore(side, point)}>{point > 0 ? `+${point}` : point}</button>)}</div></main>;
}

const root = document.getElementById("app");
if (root) render(<TeamApp />, root);
