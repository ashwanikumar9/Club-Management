export type SportKey = "badminton" | "table_tennis" | "volleyball";

export type SideKey = "A" | "B";

export type MatchFormat = "singles" | "doubles" | "team";

export type MatchStatus = "scheduled" | "live" | "closed";

export interface RallyRules {
  /** Points needed to win a normal set/game. */
  pointsPerSet: number;
  /** Total sets in the match (best of N). */
  bestOf: number;
  /** Required lead to win a set (2 = win by 2). */
  winBy: number;
  /** First to reach the cap wins the set regardless of lead. Null = no cap. */
  cap: number | null;
  /** Points needed to win the deciding (last possible) set. */
  decidingSetPoints: number;
}

/**
 * Who earned the point:
 * - "winner": the scoring side played a winning shot (asks "who" on the scoring side)
 * - "error": the opponent made an error (asks "who" on the opponent side)
 */
export type ActionCredit = "winner" | "error";

export interface ActionDef {
  key: string;
  label: string;
  credit: ActionCredit;
  /** Commentary templates. Placeholders: {player} {side} {opponent} {opponentSide} */
  templates: string[];
  enabled: boolean;
}

export interface Player {
  id: string;
  name: string;
  jersey?: string;
}

export interface Side {
  name: string;
  players: Player[];
  /** Tournament entry playing on this side (tournament matches only). */
  entryId?: string;
}

/** Link from a match to the tournament fixture it belongs to. */
export interface TournamentLink {
  id: string;
  fixtureId: string;
  /** e.g. "Group A · Round 2" or "Semi-finals". */
  label: string;
}

/** Snapshot of the action at the time it was recorded, so later catalogue edits don't rewrite history. */
export interface ActionSnapshot {
  key: string;
  label: string;
  credit: ActionCredit;
  template: string;
}

export interface ScoreEvent {
  id: string;
  /** Sort position in the log; fractional values allow inserting points after close. */
  order: number;
  side: SideKey;
  points: number;
  action?: ActionSnapshot;
  /** Player credited: on the scoring side for winners, on the opponent side for errors. */
  actorId?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  undoneAt?: string;
  undoneBy?: string;
  deletedAt?: string;
}

export type AuditKind = "close" | "reopen" | "edit" | "insert" | "delete" | "rules" | "scorer";

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  kind: AuditKind;
  eventId?: string;
  summary: string;
}

/** A change of rules during a match. Applies from `fromSet` (0-based) onwards. */
export interface RuleChange {
  id: string;
  fromSet: number;
  rules: RallyRules;
  at: string;
  by: string;
}

/** A person given scoring access to a match (identified by mobile number, email or username). */
export interface ScorerAccess {
  user: string;
  addedBy: string;
  addedAt: string;
}

/**
 * A request by someone with access to take over from the active scorer. The active scorer can allow or
 * decline; if they don't answer before `expiresAt` (e.g. their phone has died) scoring passes automatically.
 */
export interface TakeoverRequest {
  id: string;
  from: string;
  /** The active scorer when the request was made. */
  to: string;
  requestedAt: string;
  expiresAt: string;
  status: "pending" | "allowed" | "declined" | "auto" | "cancelled";
  decidedAt?: string;
}

export interface DetailSettings {
  askHow: boolean;
  askWho: boolean;
}

export interface Match {
  id: string;
  sport: SportKey;
  title: string;
  venue: string;
  livestreamUrl: string;
  format: MatchFormat;
  /** Rules the match started with (editable until the match starts). */
  rules: RallyRules;
  /** Rule changes made while the match was live (e.g. shortened sets due to weather). */
  ruleChanges: RuleChange[];
  actions: ActionDef[];
  settings: DetailSettings;
  sides: Record<SideKey, Side>;
  /** Person who created the match; can manage scorers and correct closed matches. */
  organiser: string;
  /** People with scoring access. Only one of them (or the organiser) scores at a time. */
  scorers: ScorerAccess[];
  /** The one person currently in control of scoring. */
  activeScorer?: string;
  /** Latest take-over request (kept after it is decided so the requester sees the outcome). */
  takeoverRequest?: TakeoverRequest;
  tournament?: TournamentLink;
  status: MatchStatus;
  createdAt: string;
  startedAt?: string;
  closedAt?: string;
  closedBy?: string;
  events: ScoreEvent[];
  history: AuditEntry[];
  version: number;
}
