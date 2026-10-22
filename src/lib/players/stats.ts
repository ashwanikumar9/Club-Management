import { activeEvents, matchState } from "../rally/engine";
import type { Match, SideKey, SportKey } from "../rally/types";
import { podium, type Data } from "../tournament/engine";
import type { Tournament } from "../tournament/types";

export interface SportStats {
  sport: SportKey;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
}

export interface Appearance {
  match: Match;
  side: SideKey;
  /** Closed with a winner: whether the player's side won. */
  result: "won" | "lost" | null;
  /** When the match was last played (or created, if not started). */
  at: string;
}

export interface Medal {
  tournament: Tournament;
  place: 1 | 2 | 3;
}

export interface PlayerStats {
  bySport: SportStats[];
  played: number;
  won: number;
  lost: number;
  /** Last five results, most recent first. */
  form: ("W" | "L")[];
  live: Appearance[];
  upcoming: Appearance[];
  /** Finished matches, most recent first. */
  results: Appearance[];
  medals: Medal[];
  /** Winning shots credited to the player, most used first. */
  topShots: { label: string; count: number }[];
  /** Teams and pairs the player has played in. */
  teams: string[];
}

/** The side the card's player is on in this match, if any. */
export function sideOf(match: Match, cardId: string): SideKey | null {
  for (const side of ["A", "B"] as const) if (match.sides[side].players.some((p) => p.cardId === cardId)) return side;
  return null;
}

function lastPlayed(match: Match): string {
  return activeEvents(match.events).at(-1)?.createdAt ?? match.createdAt;
}

/** Everything a player's profile shows, worked out from the matches, ties and tournaments they appear in. */
export function playerStats(cardId: string, data: Data, tournaments: Tournament[]): PlayerStats {
  const appearances: Appearance[] = [];
  const sports = new Map<SportKey, SportStats>();
  const shots = new Map<string, number>();
  const teams = new Set<string>();

  for (const match of Object.values(data.matches)) {
    const side = sideOf(match, cardId);
    if (!side) continue;
    const other = side === "A" ? "B" : "A";
    const state = matchState(match);
    const winner = match.status === "closed" ? state.winner : null;
    appearances.push({ match, side, result: winner ? (winner === side ? "won" : "lost") : null, at: lastPlayed(match) });
    if (match.tie) teams.add(match.tie.teams[side]);
    else if (match.format !== "singles") teams.add(match.sides[side].name);

    if (match.status !== "closed" || !winner) continue;
    const s = sports.get(match.sport) ?? { sport: match.sport, played: 0, won: 0, lost: 0, gamesWon: 0, gamesLost: 0, pointsWon: 0, pointsLost: 0 };
    s.played += 1;
    s.won += winner === side ? 1 : 0;
    s.lost += winner === side ? 0 : 1;
    s.gamesWon += state.setsWon[side];
    s.gamesLost += state.setsWon[other];
    for (const set of state.sets) {
      s.pointsWon += set[side];
      s.pointsLost += set[other];
    }
    sports.set(match.sport, s);

    const me = match.sides[side].players.find((p) => p.cardId === cardId)!;
    for (const e of activeEvents(match.events)) {
      if (e.actorId === me.id && e.side === side && e.action?.credit === "winner") shots.set(e.action.label, (shots.get(e.action.label) ?? 0) + 1);
    }
  }

  const byTime = (a: Appearance, b: Appearance) => b.at.localeCompare(a.at);
  const results = appearances.filter((a) => a.match.status === "closed").sort(byTime);
  const upcomingKey = (a: Appearance) => `${a.match.schedule?.date ?? "9999"} ${a.match.schedule?.time ?? ""} ${a.match.createdAt}`;

  const medals: Medal[] = [];
  for (const t of tournaments) {
    const entries = t.entries.filter((e) => e.players.some((p) => p.cardId === cardId)).map((e) => e.id);
    if (entries.length === 0) continue;
    const top = podium(t, data);
    if (top.first && entries.includes(top.first)) medals.push({ tournament: t, place: 1 });
    else if (top.second && entries.includes(top.second) && t.phase === "complete") medals.push({ tournament: t, place: 2 });
    else if (top.third && entries.includes(top.third)) medals.push({ tournament: t, place: 3 });
    for (const e of t.entries) if (entries.includes(e.id) && t.format !== "singles") teams.add(e.name);
  }

  const bySport = [...sports.values()].sort((a, b) => b.played - a.played);
  return {
    bySport,
    played: bySport.reduce((n, s) => n + s.played, 0),
    won: bySport.reduce((n, s) => n + s.won, 0),
    lost: bySport.reduce((n, s) => n + s.lost, 0),
    form: results
      .filter((a) => a.result)
      .slice(0, 5)
      .map((a) => (a.result === "won" ? "W" : "L")),
    live: appearances.filter((a) => a.match.status === "live").sort(byTime),
    upcoming: appearances.filter((a) => a.match.status === "scheduled").sort((a, b) => upcomingKey(a).localeCompare(upcomingKey(b))),
    results,
    medals: medals.sort((a, b) => a.place - b.place || b.tournament.createdAt.localeCompare(a.tournament.createdAt)),
    topShots: [...shots.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    teams: [...teams],
  };
}
