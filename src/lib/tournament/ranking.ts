import type { SportKey } from "../rally/types";
import type { PointsConfig } from "./types";

/**
 * How a group table is ordered:
 * - "bwf": BWF General Competition Regulations 16 — matches (ties) won, head-to-head for two, game and
 *   point difference for three or more; a player who retires or gives a walkover has all group results deleted
 * - "ittf": ITTF Regulations 3.7.5 — 2 match points for a win, 1 for a played loss, 0 for an unplayed or
 *   unfinished loss; level entries are separated using only the matches between them
 * - "fivb": FIVB pool ranking — wins, then match points (3-0 / 3-1 → 3:0, 3-2 → 2:1, forfeit → 3:0 with
 *   0-25 sets), sets ratio, points ratio, head-to-head
 * - "custom": the organiser's own points for a win and a loss, then head-to-head, set difference, point difference
 */
export type RankingKey = "bwf" | "ittf" | "fivb" | "custom";

export interface RankingInfo {
  key: RankingKey;
  label: string;
  /** Short description of the order of tie-breaks, shown under tables. */
  order: string;
  /** Points awarded, in words. */
  points: string;
}

export const RANKINGS: Record<RankingKey, RankingInfo> = {
  bwf: {
    key: "bwf",
    label: "Official BWF",
    order: "Wins → head-to-head (2 level) → game difference → point difference (3+ level)",
    points: "Ranked by matches won (ties won in team events). Retiring or a walkover deletes all of that entry's group results.",
  },
  ittf: {
    key: "ittf",
    label: "Official ITTF",
    order: "Match points → only the matches between level entries: match points, game ratio, point ratio",
    points: "2 for a win, 1 for a played loss, 0 for a walkover or retirement.",
  },
  fivb: {
    key: "fivb",
    label: "Official FIVB",
    order: "Wins → match points → sets ratio → points ratio → head-to-head",
    points: "3 for a 3-0 or 3-1 win, 2 / 1 for a 3-2 result, 0 for the loser; a forfeit counts 3-0 with 25-0 sets.",
  },
  custom: {
    key: "custom",
    label: "Custom",
    order: "Points → head-to-head (2 level) → set difference → point difference",
    points: "Your own points for a win and a loss.",
  },
};

/** The ranking each sport's governing body uses. */
export const OFFICIAL_RANKING: Record<SportKey, RankingKey> = {
  badminton: "bwf",
  table_tennis: "ittf",
  volleyball: "fivb",
};

/** One finished group fixture between entries `a` (side A) and `b` (side B). */
export interface GroupResult {
  a: string;
  b: string;
  winner: "A" | "B";
  /** Sets won (single matches) or individual matches won (team ties). */
  score: { A: number; B: number };
  /** Games won: the same as sets for single matches, games across all matches for ties. */
  games: { A: number; B: number };
  /** Rally points won. */
  points: { A: number; B: number };
  /** How a single match ended early, if it did. */
  kind?: "retired" | "walkover";
  /** The fixture was a team tie. */
  team: boolean;
  /** Sets needed to win the match, and points of a normal set (for FIVB forfeits). */
  setsToWin: number;
  setPoints: number;
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  lost: number;
  /** Table points (matches won for BWF). */
  points: number;
  /** Sets (or tie matches) won and lost. */
  setsFor: number;
  setsAgainst: number;
  /** Games won and lost (tie games for team events; equal to sets otherwise). */
  gamesFor: number;
  gamesAgainst: number;
  /** Rally points won and lost. */
  pointsFor: number;
  pointsAgainst: number;
  /** BWF: results deleted after retiring or giving a walkover. Ranked last. */
  withdrawn?: boolean;
}

type Side = "A" | "B";
const other = (s: Side): Side => (s === "A" ? "B" : "A");

/** FIVB records a forfeit as straight sets won 25-0 (to the set's points); an incomplete team loses the sets still needed. */
function fivbAdjusted(r: GroupResult): GroupResult {
  if (r.team || !r.kind) return r;
  const w = r.winner;
  const l = other(w);
  if (r.kind === "walkover") {
    return {
      ...r,
      score: { [w]: r.setsToWin, [l]: 0 } as GroupResult["score"],
      games: { [w]: r.setsToWin, [l]: 0 } as GroupResult["games"],
      points: { [w]: r.setsToWin * r.setPoints, [l]: 0 } as GroupResult["points"],
    };
  }
  const score = { ...r.score, [w]: r.setsToWin };
  return { ...r, score, games: { ...score } };
}

function tablePoints(ranking: RankingKey, r: GroupResult, side: Side, config: PointsConfig): number {
  const won = r.winner === side;
  switch (ranking) {
    case "bwf":
      return won ? 1 : 0;
    case "ittf":
      return won ? 2 : r.kind ? 0 : 1;
    case "fivb": {
      if (r.team) return won ? 3 : 0;
      const close = !r.kind && r.score[other(r.winner)] === r.setsToWin - 1 && r.setsToWin > 1;
      if (won) return close ? 2 : 3;
      return close ? 1 : 0;
    }
    default:
      return won ? config.win : config.loss;
  }
}

function emptyRow(entryId: string): StandingRow {
  return {
    entryId,
    played: 0,
    won: 0,
    lost: 0,
    points: 0,
    setsFor: 0,
    setsAgainst: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

function tally(ids: string[], results: GroupResult[], ranking: RankingKey, config: PointsConfig): Map<string, StandingRow> {
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  for (const r of results) {
    for (const side of ["A", "B"] as const) {
      const row = rows.get(side === "A" ? r.a : r.b);
      if (!row) continue;
      const o = other(side);
      const won = r.winner === side;
      row.played += 1;
      row.won += won ? 1 : 0;
      row.lost += won ? 0 : 1;
      row.points += tablePoints(ranking, r, side, config);
      row.setsFor += r.score[side];
      row.setsAgainst += r.score[o];
      row.gamesFor += r.games[side];
      row.gamesAgainst += r.games[o];
      row.pointsFor += r.points[side];
      row.pointsAgainst += r.points[o];
    }
  }
  return rows;
}

type Criterion = (row: StandingRow) => number;

const ratio = (won: number, lost: number) => (lost === 0 ? (won > 0 ? Number.POSITIVE_INFINITY : 0) : won / lost);

/** Splits rows into runs of equal value, best first (higher is better). */
function split(rows: StandingRow[], criterion: Criterion): StandingRow[][] {
  const sorted = [...rows].sort((p, q) => {
    const a = criterion(p);
    const b = criterion(q);
    return a === b ? 0 : b > a ? 1 : -1;
  });
  const runs: StandingRow[][] = [];
  for (const row of sorted) {
    const last = runs.at(-1);
    if (last && criterion(last[0]) === criterion(row)) last.push(row);
    else runs.push([row]);
  }
  return runs;
}

/** Winner between two entries over their matches (both legs in a double round-robin); undefined when even or unplayed. */
function headToHead(results: GroupResult[], p: string, q: string): string | undefined {
  let wins = 0;
  for (const r of results) {
    if (!((r.a === p && r.b === q) || (r.a === q && r.b === p))) continue;
    wins += (r.winner === "A" ? r.a : r.b) === p ? 1 : -1;
  }
  return wins > 0 ? p : wins < 0 ? q : undefined;
}

function pairByHeadToHead(pair: StandingRow[], results: GroupResult[]): StandingRow[] | undefined {
  const winner = headToHead(results, pair[0].entryId, pair[1].entryId);
  if (!winner) return undefined;
  return winner === pair[0].entryId ? pair : [pair[1], pair[0]];
}

/**
 * Orders rows by each criterion in turn. Two rows left level after a criterion are settled by their own
 * match(es) straight away when `twoByHeadToHead` is set, otherwise only once every criterion is used up.
 */
function rankBy(rows: StandingRow[], criteria: Criterion[], results: GroupResult[], twoByHeadToHead: boolean): StandingRow[] {
  if (rows.length <= 1) return rows;
  if (criteria.length === 0) return (rows.length === 2 && pairByHeadToHead(rows, results)) || rows; // else drawn by lot
  const [first, ...rest] = criteria;
  return split(rows, first).flatMap((run) => {
    if (run.length === 2 && twoByHeadToHead) {
      const settled = pairByHeadToHead(run, results);
      if (settled) return settled;
    }
    return rankBy(run, rest, results, twoByHeadToHead);
  });
}

/**
 * ITTF 3.7.5.2–3: level entries are compared using only the matches between them — match points, then
 * (team events) individual match ratio, game ratio and point ratio. As soon as some are separated, the
 * remaining level ones start again with only the matches among themselves.
 */
function ittfResolve(ids: string[], results: GroupResult[], config: PointsConfig, team: boolean, order: string[]): string[] {
  if (ids.length <= 1) return ids;
  const among = results.filter((r) => ids.includes(r.a) && ids.includes(r.b));
  const rows = [...tally(ids, among, "ittf", config).values()];
  const criteria: Criterion[] = [
    (r) => r.points,
    ...(team ? [(r: StandingRow) => ratio(r.setsFor, r.setsAgainst)] : []),
    (r) => ratio(r.gamesFor, r.gamesAgainst),
    (r) => ratio(r.pointsFor, r.pointsAgainst),
  ];
  for (const criterion of criteria) {
    const runs = split(rows, criterion);
    if (runs.length > 1) {
      return runs.flatMap((run) => ittfResolve(run.map((r) => r.entryId), results, config, team, order));
    }
  }
  return [...ids].sort((p, q) => order.indexOf(p) - order.indexOf(q)); // drawn by lot
}

/** The ordered table for one group from its finished fixtures. `ids` is the group's entry order (used for lots). */
export function rankGroup(ids: string[], allResults: GroupResult[], config: PointsConfig, ranking: RankingKey = "custom"): StandingRow[] {
  let results = allResults.filter((r) => ids.includes(r.a) && ids.includes(r.b));
  const team = results.some((r) => r.team);

  // BWF 16.2.5: retiring or not turning up deletes every group result of that player / pair.
  const withdrawn = new Set<string>();
  if (ranking === "bwf") {
    for (const r of results) if (!r.team && r.kind) withdrawn.add(r.winner === "A" ? r.b : r.a);
    results = results.filter((r) => !withdrawn.has(r.a) && !withdrawn.has(r.b));
  }
  if (ranking === "fivb") results = results.map(fivbAdjusted);

  const rows = tally(ids, results, ranking, config);
  for (const id of withdrawn) rows.get(id)!.withdrawn = true;
  const active = ids.filter((id) => !withdrawn.has(id)).map((id) => rows.get(id)!);
  const out = ids.filter((id) => withdrawn.has(id)).map((id) => rows.get(id)!);

  const setDiff: Criterion = (r) => r.setsFor - r.setsAgainst;
  const gameDiff: Criterion = (r) => r.gamesFor - r.gamesAgainst;
  const pointDiff: Criterion = (r) => r.pointsFor - r.pointsAgainst;
  let ordered: StandingRow[];
  switch (ranking) {
    case "bwf":
      // 16.2 / 16.3: wins; two level → their match; three or more → (ties: match difference) game difference, point difference.
      ordered = rankBy(active, [(r) => r.won, ...(team ? [setDiff] : []), gameDiff, pointDiff], results, true);
      break;
    case "ittf":
      ordered = split(active, (r) => r.points).flatMap((run) =>
        ittfResolve(run.map((r) => r.entryId), results, config, team, ids).map((id) => rows.get(id)!),
      );
      break;
    case "fivb":
      ordered = rankBy(
        active,
        [(r) => r.won, (r) => r.points, (r) => ratio(r.setsFor, r.setsAgainst), (r) => ratio(r.pointsFor, r.pointsAgainst)],
        results,
        false,
      );
      break;
    default:
      ordered = rankBy(active, [(r) => r.points, setDiff, pointDiff], results, true);
  }
  return [...ordered, ...out];
}
