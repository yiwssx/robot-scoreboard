import { useEffect, useState } from "preact/hooks";
import type { BroadcastState, ScoreboardState } from "./contracts";

export const EMPTY_SCOREBOARD: ScoreboardState = {
  scoreA: 0,
  scoreB: 0,
  shotA: "",
  shotB: "",
  missionShotsA: ["", "", "", ""],
  missionShotsB: ["", "", "", ""],
  recordedMissionShotsA: ["", "", "", ""],
  recordedMissionShotsB: ["", "", "", ""],
  teamNames: ["TEAM A", "TEAM B"],
  teamWeights: {},
  teamSchools: {},
  teamNameA: "TEAM A",
  teamNameB: "TEAM B",
  teamWeightA: null,
  teamWeightB: null,
  teamSchoolA: "",
  teamSchoolB: "",
  teamNamesVisible: true,
  matchResults: [],
  currentMatchSaved: false,
  currentMatchSavedResultId: "",
  resultLocked: false,
  resultReviewRequired: false,
  time: "00.00",
  timeElapsed: 0,
  matchDuration: 180,
  remainingSeconds: 180,
  finalWarningSeconds: 10,
  status: "READY",
  rules: { scoreAdjustments: [-20, -10, 10, 20], missions: { "1": 10, "2": 20, "3": 20, "4": 20 } },
};

export const EMPTY_BROADCAST: BroadcastState = {
  version: 1,
  generatedAt: "",
  match: { status: "READY", time: "00.00", timeElapsed: 0, remainingSeconds: 0, matchDuration: 180 },
  teamA: { name: "TEAM A", school: "", score: 0, shot: "", missions: ["", "", "", ""], visible: true },
  teamB: { name: "TEAM B", school: "", score: 0, shot: "", missions: ["", "", "", ""], visible: true },
  result: { winner: null, winnerName: "", locked: false },
};

type Listener = () => void;

export class ExternalStore<T> {
  private value: T;
  private connected = false;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.value = initial;
  }

  getSnapshot() {
    return { value: this.value, connected: this.connected };
  }

  setValue(value: T) {
    this.value = value;
    this.emit();
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

export function useExternalStore<T>(store: ExternalStore<T>) {
  const [snapshot, setSnapshot] = useState(store.getSnapshot());
  useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store]);
  return snapshot;
}
