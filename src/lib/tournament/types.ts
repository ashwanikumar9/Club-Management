import type { MatchFormat, RallyRules, SportKey } from "../rally/types";
import type { RankingKey } from "./ranking";

export type Structure = "league" | "knockout" | "groups_knockout";

export type TournamentPhase = "setup" | "groups" | "knockout" | "complete";

export interface EntryPlayer {
  name: string;
  jersey?: string;
}

/** A team, pair or individual player taking part. */
export interface Entry {
  id: string;
  name: string;
  players: EntryPlayer[];
  /** 1 = top seed. Unseeded entries are placed after all seeded ones. */
  seed?: number;
}

export interface Group {
  id: string;
  name: string;
  entryIds: string[];
}

/** Where a knockout side comes from: a known entry, the winner or loser of an earlier fixture, or a bye. */
export type Source =
  | { type: "entry"; entryId: string }
  | { type: "winner"; fixtureId: string }
  | { type: "loser"; fixtureId: string }
  | { type: "bye" };

/** When and where a match is played. Dates are YYYY-MM-DD and times HH:MM (local to the venue). */
export interface Schedule {
  date?: string;
  time?: string;
  court?: string;
}

export interface Fixture {
  id: string;
  stage: "group" | "knockout";
  groupId?: string;
  /** Group round (1-based) or knockout round (1 = first round). */
  round: number;
  /** Position within the round. */
  index: number;
  a: Source;
  b: Source;
  /** The live-scored match, created once both sides are known. */
  matchId?: string;
  /** For team-tie tournaments: the tie played for this fixture. */
  tieId?: string;
  /** The third-place play-off between the semi-final losers. */
  third?: boolean;
  schedule?: Schedule;
  /** Set for fixtures of an extra round added by the organiser (not part of the main structure). */
  stageId?: string;
}

/**
 * An extra round the organiser adds on top of the main structure, e.g. a "Super 4" round-robin, a
 * "Plate" knockout for teams that didn't qualify, or a few one-off matches.
 */
export interface Stage {
  id: string;
  name: string;
  kind: "league" | "knockout" | "matches";
  entryIds: string[];
  /** League rounds: the groups of this round (separate from the main groups). */
  groups: Group[];
  thirdPlace: boolean;
}

export interface PointsConfig {
  win: number;
  loss: number;
}

export interface Tournament {
  id: string;
  name: string;
  sport: SportKey;
  format: MatchFormat;
  venue: string;
  startDate: string;
  /** Courts / tables / grounds matches are played on. */
  courts: string[];
  organiser: string;
  /** People given scoring access to every match of the tournament. */
  scorers: string[];
  rules: RallyRules;
  points: PointsConfig;
  /** How group tables are ordered. Missing on older tournaments, which use "custom". */
  ranking?: RankingKey;
  structure: Structure;
  /** Times each pair meets in a league or group: 1, or 2 for home and away. Missing = 1. */
  legs?: 1 | 2;
  /** Teams per group that go through to the knockout (groups → knockout only). */
  qualifiersPerGroup: number;
  /** Knockout includes a third-place match between the semi-final losers. */
  thirdPlace: boolean;
  /**
   * Badminton / table tennis team events: each fixture is a tie of this many matches (odd). Line-ups are
   * set on the tie page before each match.
   */
  tieMatchCount?: number;
  /** Official team system for ties (see tie/systems.ts); overrides `tieMatchCount`. */
  tieSystem?: string;
  entries: Entry[];
  /** Groups of the main structure. */
  groups: Group[];
  fixtures: Fixture[];
  /** Extra rounds added by the organiser. */
  stages: Stage[];
  phase: TournamentPhase;
  createdAt: string;
  version: number;
}
