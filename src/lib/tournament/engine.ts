import { matchState } from "../rally/engine";
import type { Match } from "../rally/types";
import type { Entry, Fixture, Group, PointsConfig, Source, Tournament } from "./types";

/**
 * Round-robin pairings using the circle method: every entry meets every other once, spread over rounds
 * so nobody plays twice in a round. With an odd count one entry rests each round.
 */
export function roundRobin(ids: string[]): [string, string][][] {
  const list: (string | null)[] = [...ids];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!); // rotate all but the first
  }
  return rounds;
}

/** Bracket positions for seeds 1..size so that seeds 1 and 2 can only meet in the final. e.g. 8 → [1,8,4,5,2,7,3,6] */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

/** Seeded entries by seed number, then unseeded entries in the order given. */
export function seedOrder(entries: Entry[]): Entry[] {
  const seeded = entries.filter((e) => e.seed !== undefined).sort((a, b) => a.seed! - b.seed!);
  const unseeded = entries.filter((e) => e.seed === undefined);
  return [...seeded, ...unseeded];
}

/** Spreads entries over groups in snake order (A B C C B A …) so top seeds land in different groups. */
export function snakeAssign(orderedIds: string[], groupCount: number): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  orderedIds.forEach((id, i) => {
    const lap = Math.floor(i / groupCount);
    const pos = i % groupCount;
    groups[lap % 2 === 0 ? pos : groupCount - 1 - pos].push(id);
  });
  return groups;
}

/** Builds a seeded single-elimination bracket. `rankedIds[0]` is the top seed. */
export function buildKnockout(rankedIds: string[], newId: () => string): Fixture[] {
  let size = 2;
  while (size < rankedIds.length) size *= 2;
  const order = bracketOrder(size);
  const fixtures: Fixture[] = [];
  const sourceFor = (seed: number): Source =>
    seed <= rankedIds.length ? { type: "entry", entryId: rankedIds[seed - 1] } : { type: "bye" };

  let previous: Fixture[] = [];
  for (let i = 0; i < size / 2; i++) {
    previous.push({
      id: newId(),
      stage: "knockout",
      round: 1,
      index: i,
      a: sourceFor(order[2 * i]),
      b: sourceFor(order[2 * i + 1]),
    });
  }
  fixtures.push(...previous);
  for (let round = 2; previous.length > 1; round++) {
    const current: Fixture[] = [];
    for (let i = 0; i < previous.length / 2; i++) {
      current.push({
        id: newId(),
        stage: "knockout",
        round,
        index: i,
        a: { type: "winner", fixtureId: previous[2 * i].id },
        b: { type: "winner", fixtureId: previous[2 * i + 1].id },
      });
    }
    fixtures.push(...current);
    previous = current;
  }
  return fixtures;
}

export interface MatchResult {
  winner: "A" | "B" | null;
  sets: { A: number; B: number };
  points: { A: number; B: number };
  closed: boolean;
}

export function matchResult(match: Match): MatchResult {
  const state = matchState(match);
  const points = { A: 0, B: 0 };
  for (const set of state.sets) {
    points.A += set.A;
    points.B += set.B;
  }
  return { winner: match.status === "closed" ? state.winner : null, sets: state.setsWon, points, closed: match.status === "closed" };
}

export type Matches = Record<string, Match>;

/** Entry on a match side, read from the match itself (the match records which entry plays each side). */
function sideEntry(match: Match, side: "A" | "B"): string | undefined {
  return match.sides[side].entryId;
}

/** Winner entry of a fixture: from its closed match, or straight through when the other side is a bye. */
export function fixtureWinner(fixture: Fixture, fixtures: Fixture[], matches: Matches): string | undefined {
  const { a, b } = resolveSides(fixture, fixtures, matches);
  if (fixture.a.type === "bye" && b) return b;
  if (fixture.b.type === "bye" && a) return a;
  const match = fixture.matchId ? matches[fixture.matchId] : undefined;
  if (!match) return undefined;
  const result = matchResult(match);
  return result.winner ? sideEntry(match, result.winner) : undefined;
}

function resolveSource(source: Source, fixtures: Fixture[], matches: Matches): string | undefined {
  if (source.type === "entry") return source.entryId;
  if (source.type === "bye") return undefined;
  const from = fixtures.find((f) => f.id === source.fixtureId);
  return from ? fixtureWinner(from, fixtures, matches) : undefined;
}

export function resolveSides(fixture: Fixture, fixtures: Fixture[], matches: Matches) {
  return { a: resolveSource(fixture.a, fixtures, matches), b: resolveSource(fixture.b, fixtures, matches) };
}

/** A fixture that will never be played because one side is a bye. */
export function isByeFixture(fixture: Fixture): boolean {
  return fixture.a.type === "bye" || fixture.b.type === "bye";
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  setsFor: number;
  setsAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** Points table for a group, sorted: points → head-to-head (two-way ties) → set difference → point difference. */
export function standings(group: Group, fixtures: Fixture[], matches: Matches, config: PointsConfig): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    group.entryIds.map((id) => [
      id,
      { entryId: id, played: 0, won: 0, lost: 0, points: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0 },
    ]),
  );
  const headToHead = new Map<string, string>(); // "x|y" → winner

  for (const fixture of fixtures) {
    if (fixture.groupId !== group.id || !fixture.matchId) continue;
    const match = matches[fixture.matchId];
    if (!match) continue;
    const result = matchResult(match);
    if (!result.winner) continue; // only confirmed results count
    for (const side of ["A", "B"] as const) {
      const other = side === "A" ? "B" : "A";
      const row = rows.get(match.sides[side].entryId ?? "");
      if (!row) continue;
      row.played += 1;
      const won = result.winner === side;
      row.won += won ? 1 : 0;
      row.lost += won ? 0 : 1;
      row.points += won ? config.win : config.loss;
      row.setsFor += result.sets[side];
      row.setsAgainst += result.sets[other];
      row.pointsFor += result.points[side];
      row.pointsAgainst += result.points[other];
    }
    const [x, y] = [match.sides.A.entryId!, match.sides.B.entryId!].sort();
    headToHead.set(`${x}|${y}`, match.sides[result.winner].entryId!);
  }

  const list = [...rows.values()];
  return list.sort((p, q) => {
    if (q.points !== p.points) return q.points - p.points;
    const level = list.filter((r) => r.points === p.points);
    if (level.length === 2) {
      const [x, y] = [p.entryId, q.entryId].sort();
      const winner = headToHead.get(`${x}|${y}`);
      if (winner) return winner === p.entryId ? -1 : 1;
    }
    const setDiff = q.setsFor - q.setsAgainst - (p.setsFor - p.setsAgainst);
    if (setDiff !== 0) return setDiff;
    return q.pointsFor - q.pointsAgainst - (p.pointsFor - p.pointsAgainst);
  });
}

/**
 * Qualifiers from the group stage, ranked for knockout seeding: all group winners first (A1, B1, …),
 * then all runners-up, and so on. With bracketOrder this keeps a group's entries apart in round one
 * (e.g. two groups → A1 v B2 and B1 v A2).
 */
export function qualifiers(t: Tournament, matches: Matches): string[] {
  const tables = t.groups.map((g) => standings(g, t.fixtures, matches, t.points));
  const ranked: string[] = [];
  for (let pos = 0; pos < t.qualifiersPerGroup; pos++) {
    for (const table of tables) if (table[pos]) ranked.push(table[pos].entryId);
  }
  return ranked;
}

export function groupStageComplete(t: Tournament, matches: Matches): boolean {
  return t.fixtures
    .filter((f) => f.stage === "group")
    .every((f) => f.matchId && matches[f.matchId] && matchResult(matches[f.matchId]).winner);
}

export function champion(t: Tournament, matches: Matches): string | undefined {
  if (t.structure === "league") {
    if (!groupStageComplete(t, matches) || t.groups.length === 0) return undefined;
    return standings(t.groups[0], t.fixtures, matches, t.points)[0]?.entryId;
  }
  const knockout = t.fixtures.filter((f) => f.stage === "knockout");
  if (knockout.length === 0) return undefined;
  const lastRound = Math.max(...knockout.map((f) => f.round));
  const final = knockout.find((f) => f.round === lastRound);
  return final ? fixtureWinner(final, t.fixtures, matches) : undefined;
}

export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-finals";
  if (fromEnd === 2) return "Quarter-finals";
  return `Round of ${2 ** (fromEnd + 1)}`;
}
