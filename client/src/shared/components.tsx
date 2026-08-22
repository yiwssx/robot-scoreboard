import type { ComponentChildren } from "preact";
import type { MatchStatus, TeamSide } from "../core/contracts";

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return <span class={`status-line ${connected ? "is-connected" : "is-offline"}`}>{connected ? "SERVER: ONLINE" : "SERVER: OFFLINE"}</span>;
}

export function BrandHeader({ title, subtitle, connected }: { title: string; subtitle: string; connected?: boolean }) {
  return (
    <>
      <div class="brand-strip">
        <img class="brand-logo" src="/assets/vec-seal.png" alt="R-VEC Robot Contest" />
        <div class="event-title"><strong>{title}</strong><span>{subtitle}</span></div>
        <img class="brand-seal" src="/assets/robot-contest-logo.png" alt="Vocational Education Commission" />
      </div>
      {connected !== undefined && <div class="architecture-status"><ConnectionBadge connected={connected} /></div>}
    </>
  );
}

export function ScoreSummary({ side, name, score, shot, school }: { side: TeamSide; name: string; score: number; shot: string; school?: string }) {
  return (
    <div class="live-score" data-side={side}>
      <span>TEAM {side}</span>
      <strong>{name}</strong>
      {school && <small>{school}</small>}
      <b>{score}</b>
      <span>SHOT <em>{shot || "--.--"}</em></span>
    </div>
  );
}

export function MatchClock({ time, status }: { time: string; status: MatchStatus }) {
  return <div class="live-clock"><span>TIME</span><strong>{time}</strong><span>{status}</span></div>;
}

export function Panel({ title, children, className = "" }: { title?: string; children: ComponentChildren; className?: string }) {
  return <section class={`box ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}
