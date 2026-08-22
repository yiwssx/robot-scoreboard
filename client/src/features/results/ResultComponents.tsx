import { useState } from "preact/hooks";
import type { MatchResult, ScoreboardState, TeamSide } from "../../core/contracts";
import type { CommandClient } from "../../core/realtime";

function weight(value: number | null | undefined) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value).toFixed(1)} kg` : "-";
}

function missions(value?: string[]) {
  const source = Array.isArray(value) ? value : [];
  return [0, 1, 2, 3].map((index) => source[index] || "--.--").join(" / ");
}

export function printResults(results: MatchResult[]) {
  if (!results.length) return;
  const report = window.open("", "_blank");
  if (!report) return;
  const rows = results.map((result) => `<tr><td>${result.matchNumber ?? "-"}</td><td>${result.teamNameA || "TEAM A"}</td><td>${result.scoreA ?? 0}</td><td>${result.shotA || "--.--"}</td><td>${result.teamNameB || "TEAM B"}</td><td>${result.scoreB ?? 0}</td><td>${result.shotB || "--.--"}</td><td>${result.winnerName || "เสมอ"}</td></tr>`).join("");
  report.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Match Results</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:7px;font-size:12px}th{background:#eee}</style></head><body><h1>รายงานผลการแข่งขัน ROBOT CONTEST</h1><table><thead><tr><th>คู่</th><th>ทีม A</th><th>คะแนน A</th><th>SHOT A</th><th>ทีม B</th><th>คะแนน B</th><th>SHOT B</th><th>ผู้ชนะ</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  report.document.close();
  window.setTimeout(() => { report.focus(); report.print(); }, 150);
}

export function MatchHistory({ results, connected, commands, compact = false }: { results: MatchResult[]; connected: boolean; commands?: CommandClient; compact?: boolean }) {
  const visible = compact ? results.slice(0, 5) : results;
  async function remove(id: string) {
    if (!commands || !connected || !id || !window.confirm("ยืนยันลบผลการแข่งขันรายการนี้?")) return;
    await commands.deleteResult(id);
  }
  return (
    <div class="history-table-wrap">
      <div class="history-tools"><strong>{results.length} รายการ</strong><button type="button" class="blue" disabled={!results.length} onClick={() => printResults(results)}>พิมพ์ / PDF</button></div>
      {visible.length === 0 ? <div class="empty-history">ยังไม่มีประวัติการแข่งขัน</div> : (
        <table class="result-history-table"><thead><tr><th>คู่</th><th>ทีม A</th><th>WEIGHT</th><th>SHOT</th><th>ภารกิจ</th><th>ผล</th><th>ทีม B</th><th>WEIGHT</th><th>SHOT</th><th>ภารกิจ</th><th>ผู้ชนะ</th>{commands && <th>จัดการ</th>}</tr></thead><tbody>
          {visible.map((result) => <tr key={result.id}><td>{result.matchNumber ?? "-"}</td><td>{result.teamNameA || "TEAM A"}</td><td>{weight(result.teamWeightA)}</td><td>{result.shotA || "--.--"}</td><td>{missions(result.missionShotsA)}</td><td><strong>{result.scoreA ?? 0} - {result.scoreB ?? 0}</strong></td><td>{result.teamNameB || "TEAM B"}</td><td>{weight(result.teamWeightB)}</td><td>{result.shotB || "--.--"}</td><td>{missions(result.missionShotsB)}</td><td>{result.winnerName || "เสมอ"}</td>{commands && <td><button type="button" class="red" disabled={!connected || !result.id} onClick={() => void remove(result.id)}>ลบ</button></td>}</tr>)}
        </tbody></table>
      )}
    </div>
  );
}

function SideCorrection({ side, state, commands, locked, feedback }: { side: TeamSide; state: ScoreboardState; commands: CommandClient; locked: boolean; feedback: (text: string) => void }) {
  const [shot, setShot] = useState("");
  const [mission, setMission] = useState("1");
  const [missionTime, setMissionTime] = useState("");
  const score = side === "A" ? state.scoreA : state.scoreB;
  const name = side === "A" ? state.teamNameA : state.teamNameB;
  async function act(promise: Promise<any>) {
    const result = await promise;
    feedback(result && result.ok ? "บันทึกการแก้ไขแล้ว" : `ไม่สำเร็จ: ${result && result.code || "UNKNOWN"}`);
  }
  return <div class="fs-card" data-side={side}><h3>{name}</h3><div class="fs-current">คะแนน {score} | SHOT {side === "A" ? state.shotA || "--.--" : state.shotB || "--.--"}</div><div class="fs-row">{state.rules.scoreAdjustments.map((delta) => <button type="button" disabled={locked} onClick={() => void act(commands.correctResult({ type: "score", team: side, delta }))}>{delta > 0 ? `+${delta}` : delta}</button>)}</div><div class="fs-row"><label>SHOT</label><input value={shot} placeholder="MM.SS" disabled={locked} onInput={(event) => setShot((event.currentTarget as HTMLInputElement).value)} /><button type="button" disabled={locked || !shot} onClick={() => void act(commands.correctResult({ type: "shot", team: side, value: shot }))}>บันทึก SHOT</button></div><div class="fs-row"><label>ภารกิจ</label><select value={mission} disabled={locked} onChange={(event) => setMission((event.currentTarget as HTMLSelectElement).value)}>{[1,2,3,4].map((n) => <option value={n}>{n}</option>)}</select><input value={missionTime} placeholder="MM.SS" disabled={locked} onInput={(event) => setMissionTime((event.currentTarget as HTMLInputElement).value)} /><button type="button" disabled={locked || !missionTime} onClick={() => void act(commands.correctResult({ type: "mission-shot", team: side, mission: Number(mission), value: missionTime }))}>แก้เวลา</button></div></div>;
}

export function ResultReview({ state, commands }: { state: ScoreboardState; commands: CommandClient }) {
  const [message, setMessage] = useState("");
  if (state.status !== "FINISH") return null;
  const locked = Boolean(state.resultLocked);
  async function finalize() {
    if (locked || !window.confirm("ยืนยันผลคู่นี้? หลังยืนยันผลจะถูกล็อก")) return;
    const reply = await commands.finalizeResult();
    setMessage(reply.ok ? "ยืนยันและล็อกผลการแข่งขันแล้ว" : `ไม่สำเร็จ: ${reply.code || "UNKNOWN"}`);
  }
  return <section class="box result-section" id="fieldResultReview"><div class="section-head"><h2>RESULT REVIEW / CORRECTION</h2><span class="status-line">{locked ? "LOCKED" : "REVIEW REQUIRED"}</span></div><div class="fs-grid"><SideCorrection side="A" state={state} commands={commands} locked={locked} feedback={setMessage} /><SideCorrection side="B" state={state} commands={commands} locked={locked} feedback={setMessage} /></div>{message && <div class="result-message">{message}</div>}<button type="button" id="fsFinalize" disabled={locked} onClick={() => void finalize()}>ยืนยันผลการแข่งขันและล็อกผล</button></section>;
}
