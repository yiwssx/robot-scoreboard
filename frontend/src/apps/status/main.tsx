import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ExternalStore, EMPTY_SCOREBOARD, useExternalStore } from "../../core/store";
import { createOperatorRealtime } from "../../core/realtime";
import type { FieldDiagnostics } from "../../core/contracts";
import { BrandHeader, Panel } from "../../shared/components";

const liveStore = new ExternalStore(EMPTY_SCOREBOARD);
createOperatorRealtime("status", liveStore);

function StatusApp() {
  const { connected } = useExternalStore(liveStore);
  const [diagnostics, setDiagnostics] = useState<FieldDiagnostics | null>(null);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/field-status", { cache: "no-store" });
      const data = await response.json() as FieldDiagnostics;
      setDiagnostics(data); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "STATUS FETCH FAILED"); }
  }
  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(id); }, []);
  return <main class="status-shell"><BrandHeader title="FIELD READINESS" subtitle="CENTRAL MACHINE / BROADCAST HEALTH" connected={connected} />{error && <div class="result-message" data-state="offline">{error}</div>}{!diagnostics ? <Panel title="กำลังตรวจสอบ"><p>กำลังโหลดสถานะ...</p></Panel> : <><div class="field-ready-banner" data-ready={diagnostics.ok ? "yes" : "no"}>{diagnostics.ok ? "READY FOR FIELD CHECK" : "ATTENTION REQUIRED"}</div><div class="status-grid"><Panel title="CENTRAL SYSTEM"><p><strong>{diagnostics.hostname}</strong> · {diagnostics.platform} · {diagnostics.node}</p><p>Scoreboard: {diagnostics.scoreboard.status} · {diagnostics.scoreboard.time}</p>{diagnostics.network.map((item) => <p>{item.interface}: <strong>{item.address}</strong></p>)}</Panel><Panel title="BROADCAST / OBS"><p>Text output: <strong>{diagnostics.broadcast?.ok ? "READY" : "CHECK"}</strong></p><p>Mode: LOCAL FILESYSTEM · {diagnostics.broadcast?.fileCount ?? 0} files</p><p>Last flush: {diagnostics.broadcast?.lastFlushAt || "-"}</p><p>OBS dir: {diagnostics.broadcast?.obsDir || "-"}</p><p>Browser overlay: <code>http://127.0.0.1:3000/overlay/main</code></p><p>OBS WebSocket control: {diagnostics.broadcast?.obsControl?.configured ? (diagnostics.broadcast.obsControl.connected ? "CONNECTED" : "DISCONNECTED") : "OPTIONAL / NOT CONFIGURED"}</p></Panel><Panel title="FIELD CLIENTS"><p>Total: <strong>{diagnostics.clients.total}</strong></p>{Object.entries(diagnostics.clients.counts).map(([role, count]) => <p>{role}: <strong>{count}</strong></p>)}</Panel><Panel title="CHECKS"><div class="field-check-list">{diagnostics.checks.map((check) => <div class="field-check-row" data-ok={check.ok ? "yes" : "no"}><strong>{check.ok ? "PASS" : "FAIL"}</strong><span>{check.name}</span><small>{check.detail}</small></div>)}</div></Panel></div><button type="button" class="blue" onClick={() => void refresh()}>REFRESH</button></>}</main>;
}

const root = document.getElementById("app");
if (root) render(<StatusApp />, root);
