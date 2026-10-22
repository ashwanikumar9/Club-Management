import { matchState, setsToWin } from "../rally/engine";
import type { Match } from "../rally/types";
import { tieState } from "../tie/tie";
import type { Tie } from "../tie/types";
import { rankGroup, type GroupResult, type RankingKey, type StandingRow } from "./ranking";
import type { Entry, Fixture, Group, PointsConfig, Source, Tournament } from "./types";

export type { StandingRow } from "./ranking";

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

/** Whether a fixture belongs to the main structure (not an extra round). */
export const isMain = (f: Fixture) => !f.stageId;

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

/**
 * Builds a seeded single-elimination bracket. `rankedIds[0]` is the top seed. With `thirdPlace`, the
 * semi-final losers also play off for third place.
 */
export function buildKnockout(rankedIds: string[], newId: () => string, thirdPlace = false): Fixture[] {
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
  const third = thirdPlaceFixture(fixtures, newId);
  if (thirdPlace && third) fixtures.push(third);
  return fixtures;
}

/** The play-off between the two semi-final losers (none when the bracket has no semi-finals). */
export function thirdPlaceFixture(fixtures: Fixture[], newId: () => string): Fixture | undefined {
  const knockout = fixtures.filter((f) => f.stage === "knockout" && !f.third);
  if (knockout.length === 0) return undefined;
  const last = Math.max(...knockout.map((f) => f.round));
  const semis = knockout.filter((f) => f.round === last - 1).sort((a, b) => a.index - b.index);
  if (semis.length !== 2) return undefined;
  return {
    id: newId(),
    stage: "knockout",
    round: last,
    index: 1,
    third: true,
    a: { type: "loser", fixtureId: semis[0].id },
    b: { type: "loser", fixtureId: semis[1].id },
  };
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
export type Ties = Record<string, Tie>;

/** Everything a tournament's results are read from. */
export interface Data {
  matches: Matches;
  ties: Ties;
}

/** Result of a fixture, whether it is a single match or a team tie. */
export interface FixtureOutcome {
  /** Entry on each side, as recorded on the match or tie. */
  entries: { A?: string; B?: string };
  status: "none" | "scheduled" | "live" | "closed";
  winner: "A" | "B" | null;
  /** Sets won (match) or matches won (tie). */
  score: { A: number; B: number };
  /** Games won: sets for a match, games across all matches for a tie. */
  games: { A: number; B: number };
  /** Rally points won. */
  points: { A: number; B: number };
  /** A single match that ended by retirement or walkover. */
  kind?: "retired" | "walkover";
  team: boolean;
  /** Sets needed to win and points of a normal set (single matches). */
  setsToWin: number;
  setPoints: number;
}

const NONE: FixtureOutcome = {
  entries: {},
  status: "none",
  winner: null,
  score: { A: 0, B: 0 },
  games: { A: 0, B: 0 },
  points: { A: 0, B: 0 },
  team: false,
  setsToWin: 1,
  setPoints: 0,
};

export function fixtureOutcome(fixture: Fixture, data: Data): FixtureOutcome {
  if (fixture.tieId) {
    const tie = data.ties[fixture.tieId];
    if (!tie) return NONE;
    const state = tieState(tie, data.matches);
    const started = tie.slots.some((s) => s.matchId && data.matches[s.matchId]?.status !== "scheduled");
    return {
      entries: { A: tie.teams.A.entryId, B: tie.teams.B.entryId },
      status: state.complete ? "closed" : started ? "live" : "scheduled",
      winner: state.complete ? state.winner : null,
      score: state.score,
      games: state.games,
      points: state.points,
      team: true,
      setsToWin: state.needed,
      setPoints: 0,
    };
  }
  const match = fixture.matchId ? data.matches[fixture.matchId] : undefined;
  if (!match) return NONE;
  const result = matchResult(match);
  return {
    entries: { A: match.sides.A.entryId, B: match.sides.B.entryId },
    status: match.status,
    winner: result.winner,
    score: result.sets,
    games: result.sets,
    points: result.points,
    kind: match.status === "closed" && (match.outcome?.type === "retired" || match.outcome?.type === "walkover") ? match.outcome.type : undefined,
    team: false,
    setsToWin: setsToWin(match.rules),
    setPoints: match.rules.pointsPerSet,
  };
}

/** Winner entry of a fixture: from its result, or straight through when the other side is a bye. */
export function fixtureWinner(fixture: Fixture, fixtures: Fixture[], data: Data): string | undefined {
  const { a, b } = resolveSides(fixture, fixtures, data);
  if (fixture.a.type === "bye" && b) return b;
  if (fixture.b.type === "bye" && a) return a;
  const outcome = fixtureOutcome(fixture, data);
  return outcome.winner ? outcome.entries[outcome.winner] : undefined;
}

export function fixtureLoser(fixture: Fixture, fixtures: Fixture[], data: Data): string | undefined {
  if (isByeFixture(fixture)) return undefined;
  const outcome = fixtureOutcome(fixture, data);
  return outcome.winner ? outcome.entries[outcome.winner === "A" ? "B" : "A"] : undefined;
}

function resolveSource(source: Source, fixtures: Fixture[], data: Data): string | undefined {
  if (source.type === "entry") return source.entryId;
  if (source.type === "bye") return undefined;
  const from = fixtures.find((f) => f.id === source.fixtureId);
  if (!from) return undefined;
  return source.type === "winner" ? fixtureWinner(from, fixtures, data) : fixtureLoser(from, fixtures, data);
}

export function resolveSides(fixture: Fixture, fixtures: Fixture[], data: Data) {
  return { a: resolveSource(fixture.a, fixtures, data), b: resolveSource(fixture.b, fixtures, data) };
}

/** A fixture that will never be played because one side is a bye. */
export function isByeFixture(fixture: Fixture): boolean {
  return fixture.a.type === "bye" || fixture.b.type === "bye";
}

/** Finished results of a group's fixtures, in the form the rankings read. */
export function groupResults(group: Group, fixtures: Fixture[], data: Data): GroupResult[] {
  const results: GroupResult[] = [];
  for (const fixture of fixtures) {
    if (fixture.groupId !== group.id) continue;
    const o = fixtureOutcome(fixture, data);
    if (!o.winner || !o.entries.A || !o.entries.B) continue; // only confirmed results count
    results.push({ a: o.entries.A, b: o.entries.B, winner: o.winner, score: o.score, games: o.games, points: o.points, kind: o.kind, team: o.team, setsToWin: o.setsToWin, setPoints: o.setPoints });
  }
  return results;
}

/** Points table for a group, ordered by the tournament's ranking (see ranking.ts). */
export function standings(group: Group, fixtures: Fixture[], data: Data, config: PointsConfig, ranking: RankingKey = "custom"): StandingRow[] {
  return rankGroup(group.entryIds, groupResults(group, fixtures, data), config, ranking);
}

/** The table for a group of this tournament, using its ranking. */
export function tableFor(t: Tournament, group: Group, data: Data): StandingRow[] {
  return standings(group, t.fixtures, data, t.points, t.ranking);
}

/**
 * Qualifiers from the group stage, ranked for knockout seeding: all group winners first (A1, B1, …),
 * then all runners-up, and so on. With bracketOrder this keeps a group's entries apart in round one
 * (e.g. two groups → A1 v B2 and B1 v A2).
 */
export function qualifiers(t: Tournament, data: Data): string[] {
  const tables = t.groups.map((g) => tableFor(t, g, data));
  const ranked: string[] = [];
  for (let pos = 0; pos < t.qualifiersPerGroup; pos++) {
    for (const table of tables) if (table[pos]) ranked.push(table[pos].entryId);
  }
  return ranked;
}

export function groupStageComplete(t: Tournament, data: Data): boolean {
  return t.fixtures.filter((f) => f.stage === "group" && isMain(f)).every((f) => fixtureOutcome(f, data).winner);
}

export function finalFixture(t: Tournament, stageId?: string): Fixture | undefined {
  const knockout = t.fixtures.filter((f) => f.stage === "knockout" && !f.third && f.stageId === stageId);
  if (knockout.length === 0) return undefined;
  const last = Math.max(...knockout.map((f) => f.round));
  return knockout.find((f) => f.round === last);
}

export function champion(t: Tournament, data: Data): string | undefined {
  if (t.structure === "league") {
    if (!groupStageComplete(t, data) || t.groups.length === 0) return undefined;
    return tableFor(t, t.groups[0], data)[0]?.entryId;
  }
  const final = finalFixture(t);
  return final ? fixtureWinner(final, t.fixtures, data) : undefined;
}

/** Top three: champion, runner-up and third place (when a third-place match was played). */
export function podium(t: Tournament, data: Data): { first?: string; second?: string; third?: string } {
  if (t.structure === "league") {
    if (!groupStageComplete(t, data) || !t.groups[0]) return {};
    const table = tableFor(t, t.groups[0], data);
    return { first: table[0]?.entryId, second: table[1]?.entryId, third: table[2]?.entryId };
  }
  const final = finalFixture(t);
  const third = t.fixtures.find((f) => f.third);
  return {
    first: final && fixtureWinner(final, t.fixtures, data),
    second: final && fixtureLoser(final, t.fixtures, data),
    third: third && fixtureWinner(third, t.fixtures, data),
  };
}

/** Finished when the winner is known and any third-place match is decided too. */
export function tournamentFinished(t: Tournament, data: Data): boolean {
  if (!champion(t, data)) return false;
  const third = t.fixtures.find((f) => f.third);
  return !third || !!fixtureWinner(third, t.fixtures, data);
}

export function roundName(round: number, totalRounds: number, third = false): string {
  if (third) return "Third place";
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-finals";
  if (fromEnd === 2) return "Quarter-finals";
  return `Round of ${2 ** (fromEnd + 1)}`;
}
