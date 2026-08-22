import { render } from "preact";
import { ExternalStore, EMPTY_BROADCAST, useExternalStore } from "../../core/store";
import { createBroadcastRealtime } from "../../core/realtime";

const store = new ExternalStore(EMPTY_BROADCAST);
createBroadcastRealtime(store);

function OverlayApp() {
  const { value: state, connected } = useExternalStore(store);
  return <main class="broadcast-overlay" data-connected={connected ? "yes" : "no"}><section class="broadcast-team" data-side="A"><small>TEAM A</small><strong>{state.teamA.visible ? state.teamA.name : ""}</strong><span>{state.teamA.visible ? state.teamA.school : ""}</span><b>{state.teamA.score}</b><em>SHOT {state.teamA.shot || "--.--"}</em></section><section class="broadcast-clock"><strong>{state.match.time}</strong><span>{connected ? state.match.status : "OFFLINE"}</span></section><section class="broadcast-team" data-side="B"><small>TEAM B</small><strong>{state.teamB.visible ? state.teamB.name : ""}</strong><span>{state.teamB.visible ? state.teamB.school : ""}</span><b>{state.teamB.score}</b><em>SHOT {state.teamB.shot || "--.--"}</em></section></main>;
}

const root = document.getElementById("app");
if (root) render(<OverlayApp />, root);
