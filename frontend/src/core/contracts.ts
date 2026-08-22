export type TeamSide = "A" | "B";
export type ClientRole = "control" | "team-a" | "team-b" | "teams" | "status" | "overlay";
export type MatchStatus = "READY" | "RUNNING" | "PAUSED" | "FINISH" | "LOCKED" | string;

export interface MatchResult {
  id: string;
  matchNumber?: number;
  savedAt?: string;
  teamNameA?: string;
  teamNameB?: string;
  teamSchoolA?: string;
  teamSchoolB?: string;
  teamWeightA?: number | null;
  teamWeightB?: number | null;
  scoreA?: number;
  scoreB?: number;
  shotA?: string;
  shotB?: string;
  missionShotsA?: string[];
  missionShotsB?: string[];
  winner?: TeamSide | null;
  winnerName?: string;
  locked?: boolean;
}

export interface ScoreboardState {
  scoreA: number;
  scoreB: number;
  shotA: string;
  shotB: string;
  missionShotsA: string[];
  missionShotsB: string[];
  recordedMissionShotsA: string[];
  recordedMissionShotsB: string[];
  teamNames: string[];
  teamWeights: Record<string, number>;
  teamSchools: Record<string, string>;
  teamNameA: string;
  teamNameB: string;
  teamWeightA: number | null;
  teamWeightB: number | null;
  teamSchoolA: string;
  teamSchoolB: string;
  teamNamesVisible: boolean;
  matchResults: MatchResult[];
  currentMatchSaved: boolean;
  currentMatchSavedResultId: string;
  resultLocked: boolean;
  resultReviewRequired: boolean;
  time: string;
  timeElapsed: number;
  matchDuration: number;
  remainingSeconds: number;
  finalWarningSeconds: number;
  status: MatchStatus;
  rules: { scoreAdjustments: number[]; missions: Record<string, number> };
}

export interface ActionReply {
  ok?: boolean;
  code?: string;
  synced?: boolean;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface BroadcastTeam {
  name: string;
  school: string;
  score: number;
  shot: string;
  missions: readonly string[];
  visible: boolean;
}

export interface BroadcastState {
  version: number;
  generatedAt: string;
  match: { status: MatchStatus; time: string; timeElapsed: number; remainingSeconds: number; matchDuration: number };
  teamA: BroadcastTeam;
  teamB: BroadcastTeam;
  result: { winner: TeamSide | null; winnerName: string; locked: boolean };
}

export interface ClientSummary {
  total: number;
  counts: Record<string, number>;
  clients: Array<{ id: string; namespace: string; role: string; address: string; connectedAt: string }>;
}

export interface FieldDiagnostics {
  ok: boolean;
  checkedAt: string;
  hostname: string;
  platform: string;
  node: string;
  uptimeSeconds: number;
  network: Array<{ interface: string; address: string }>;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
  broadcast?: {
    type: string;
    localOnly: boolean;
    obsDir: string;
    fileCount: number;
    lastPublishedAt: string | null;
    lastFlushAt: string | null;
    lastError: { message: string; code: string; at: string } | null;
    ok: boolean;
    obsControl?: { transport: string; optional: boolean; configured: boolean; connected: boolean };
  } | null;
  clients: ClientSummary;
  scoreboard: { status: MatchStatus; resultLocked: boolean; teamNameA: string; teamNameB: string; time: string };
}
