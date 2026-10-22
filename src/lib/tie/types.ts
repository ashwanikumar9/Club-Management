import type { Player, RallyRules, SideKey, TournamentLink } from "../rally/types";

/** Line-ups are either all decided when the tie is created, or picked by the scorer as each match starts. */
export type LineupMode = "advance" | "at_start";

export interface TieTeam {
  name: string;
  players: Player[];
  /** Tournament entry this team represents (tournament ties only). */
  entryId?: string;
}

/** One match (rubber) of a tie. */
export interface TieSlot {
  index: number;
  format?: "singles" | "doubles";
  /** Player ids from each team's list. */
  players?: Record<SideKey, string[]>;
  /** Created when the match is started. */
  matchId?: string;
}

/**
 * A badminton / table tennis team tie: two teams play up to `matchCount` matches; the first team to win a
 * majority wins the tie and the remaining matches are not played unless the organiser chooses to play them.
 */
export interface Tie {
  id: string;
  sport: "badminton" | "table_tennis";
  title: string;
  venue: string;
  rules: RallyRules;
  teams: Record<SideKey, TieTeam>;
  matchCount: number;
  lineupMode: LineupMode;
  /** Play the remaining matches even after the tie is decided. */
  playAll: boolean;
  slots: TieSlot[];
  organiser: string;
  scorers: string[];
  tournament?: TournamentLink;
  createdAt: string;
  version: number;
}
