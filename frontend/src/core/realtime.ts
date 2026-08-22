import type { ActionReply, BroadcastState, ClientRole, ScoreboardState, TeamSide } from "./contracts";
import type { ExternalStore } from "./store";

type Ack = (reply: ActionReply) => void;

type SocketLike = {
  on(event: string, handler: (...args: any[]) => void): SocketLike;
  emit(event: string, ...args: any[]): SocketLike;
  disconnect(): void;
};

declare const io: (namespace?: string, options?: Record<string, unknown>) => SocketLike;

type CommandPayloads = {
  "start-time": undefined;
  "stop-time": undefined;
  "reset-score": undefined;
  "reset-all": undefined;
  "force-sync": undefined;
  "add-score": { team: TeamSide; point: number };
  "mission-score": { team: TeamSide; mission: number };
  "mission-shot": { team: TeamSide; mission: number };
  "end-with-bonus": { team: TeamSide };
  "team-name-add": { name: string; school: string; weight: number | null };
  "team-name-edit": { oldName: string; newName: string; school: string; weight: number | null };
  "team-name-select": { team: TeamSide; name: string };
  "team-name-delete": { name: string };
  "team-names-show": undefined;
  "team-names-hide": undefined;
  "result-correction": Record<string, unknown>;
  "result-finalize": undefined;
  "match-result-delete": { id: string };
};

type CommandEvent = keyof CommandPayloads;

function emitAck<E extends CommandEvent>(
  socket: SocketLike,
  event: E,
  ...args: CommandPayloads[E] extends undefined ? [] : [payload: CommandPayloads[E]]
): Promise<ActionReply> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reply: ActionReply) => {
      if (settled) return;
      settled = true;
      resolve(reply || {});
    };
    const ack: Ack = finish;
    if (args.length === 0) socket.emit(event, ack);
    else socket.emit(event, args[0], ack);
    window.setTimeout(() => finish({ ok: false, code: "TIMEOUT" }), 1800);
  });
}

export class CommandClient {
  constructor(private socket: SocketLike) {}

  start() { return emitAck(this.socket, "start-time"); }
  stop() { return emitAck(this.socket, "stop-time"); }
  resetScore() { return emitAck(this.socket, "reset-score"); }
  resetAll() { return emitAck(this.socket, "reset-all"); }
  forceSync() { return emitAck(this.socket, "force-sync"); }
  addScore(team: TeamSide, point: number) { return emitAck(this.socket, "add-score", { team, point }); }
  missionScore(team: TeamSide, mission: number) { return emitAck(this.socket, "mission-score", { team, mission }); }
  missionShot(team: TeamSide, mission: number) { return emitAck(this.socket, "mission-shot", { team, mission }); }
  endWithBonus(team: TeamSide) { return emitAck(this.socket, "end-with-bonus", { team }); }
  addTeam(data: { name: string; school: string; weight: number | null }) { return emitAck(this.socket, "team-name-add", data); }
  editTeam(data: { oldName: string; newName: string; school: string; weight: number | null }) { return emitAck(this.socket, "team-name-edit", data); }
  selectTeam(team: TeamSide, name: string) { return emitAck(this.socket, "team-name-select", { team, name }); }
  deleteTeam(name: string) { return emitAck(this.socket, "team-name-delete", { name }); }
  showTeamNames() { return emitAck(this.socket, "team-names-show"); }
  hideTeamNames() { return emitAck(this.socket, "team-names-hide"); }
  correctResult(data: Record<string, unknown>) { return emitAck(this.socket, "result-correction", data); }
  finalizeResult() { return emitAck(this.socket, "result-finalize"); }
  deleteResult(id: string) { return emitAck(this.socket, "match-result-delete", { id }); }
}

export function createOperatorRealtime(role: ClientRole, store: ExternalStore<ScoreboardState>) {
  const socket = io("/", { auth: { role } });
  const commands = new CommandClient(socket);
  socket.on("connect", () => store.setConnected(true));
  socket.on("disconnect", () => store.setConnected(false));
  socket.on("connect_error", () => store.setConnected(false));
  socket.on("update", (data: ScoreboardState) => {
    store.setConnected(true);
    store.setValue(data);
  });
  return { socket, commands };
}

export function createBroadcastRealtime(store: ExternalStore<BroadcastState>) {
  const socket = io("/broadcast", { auth: { role: "overlay" } });
  socket.on("connect", () => store.setConnected(true));
  socket.on("disconnect", () => store.setConnected(false));
  socket.on("connect_error", () => store.setConnected(false));
  socket.on("broadcast:update", (data: BroadcastState) => {
    store.setConnected(true);
    store.setValue(data);
  });
  return { socket };
}
