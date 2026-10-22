import type { MatchFormat, RallyRules, SportKey } from "../rally/types";

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
  organiser: string;
  /** People given scoring access to every match of the tournament. */
  scorers: string[];
  rules: RallyRules;
  points: PointsConfig;
  structure: Structure;
  /** Teams per group that go through to the knockout (groups → knockout only). */
  qualifiersPerGroup: number;
  /** Knockout includes a third-place match between the semi-final losers. */
  thirdPlace: boolean;
  /**
   * Badminton / table tennis team events: each fixture is a tie of this many matches (odd). Line-ups are
   * set on the tie page before each match.
   */
  tieMatchCount?: number;
  entries: Entry[];
  groups: Group[];
  fixtures: Fixture[];
  phase: TournamentPhase;
  createdAt: string;
  version: number;
}
