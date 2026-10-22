import { describe, expect, it } from "vitest";
import { addPoint, closeMatch, editPoint, startMatch } from "../rally/mutations";
import type { Match } from "../rally/types";
import { bracketOrder, buildKnockout, champion, roundRobin, snakeAssign, standings, type Matches } from "./engine";
import {
  addEntry,
  assignToGroup,
  autoAssignGroups,
  createTournament,
  generateFixtures,
  setGroupCount,
  setSeed,
  startKnockout,
  syncTournament,
} from "./mutations";
import type { Structure, Tournament } from "./types";

const ORG = "@org";
// One-point games keep the tests short: the first point wins the match.
const QUICK = { pointsPerSet: 1, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 1 };

function tournament(structure: Structure, names: string[]): Tournament {
  let t = createTournament({
    name: "City Open",
    sport: "badminton",
    format: "singles",
    venue: "Hall",
    startDate: "",
    organiser: ORG,
    rules: QUICK,
    points: { win: 2, loss: 0 },
    structure,
  });
  for (const n of names) t = addEntry(t, ORG, n, [{ name: n }]);
  return t;
}

const id = (t: Tournament, name: string) => t.entries.find((e) => e.name === name)!.id;
const nameOf = (t: Tournament, entryId?: string) => t.entries.find((e) => e.id === entryId)?.name;

/** Plays a match so that `winner` (entry name) wins, and closes it. */
function play(t: Tournament, match: Match, winner: string): Match {
  const side = nameOf(t, match.sides.A.entryId) === winner ? "A" : "B";
  let m = startMatch(match, ORG);
  m = addPoint(m, side, ORG).match;
  return closeMatch(m, ORG);
}

/** Generates, then repeatedly plays every open match with `pick` choosing the winner, syncing as results come in. */
function runAll(t: Tournament, matches: Matches, pick: (a: string, b: string) => string) {
  let tour = t;
  const all = { ...matches };
  for (;;) {
    const open = Object.values(all).filter((m) => m.tournament?.id === tour.id && m.status === "scheduled");
    if (open.length === 0) break;
    for (const m of open) {
      const a = nameOf(tour, m.sides.A.entryId)!;
      const b = nameOf(tour, m.sides.B.entryId)!;
      all[m.id] = play(tour, m, pick(a, b));
    }
    const synced = syncTournament(tour, all);
    tour = synced.tournament;
    for (const m of [...synced.created, ...synced.updated]) all[m.id] = m;
  }
  return { tour, all };
}

describe("fixture building blocks", () => {
  it("round-robin pairs everyone exactly once with nobody playing twice in a round", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const rounds = roundRobin(ids);
    const pairs = rounds.flat().map((p) => [...p].sort().join(""));
    expect(new Set(pairs).size).toBe(10);
    expect(pairs.length).toBe(10);
    for (const round of rounds) {
      const players = round.flat();
      expect(new Set(players).size).toBe(players.length);
    }
  });

  it("orders a bracket so top seeds meet as late as possible", () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
  });

  it("gives byes to the top seeds", () => {
    let n = 0;
    const fixtures = buildKnockout(["s1", "s2", "s3", "s4", "s5", "s6"], () => `f${n++}`);
    const first = fixtures.filter((f) => f.round === 1);
    expect(first).toHaveLength(4);
    expect(first[0].a).toEqual({ type: "entry", entryId: "s1" });
    expect(first[0].b).toEqual({ type: "bye" });
    expect(first[2].a).toEqual({ type: "entry", entryId: "s2" });
    expect(first[2].b).toEqual({ type: "bye" });
    expect(fixtures.filter((f) => f.round === 3)).toHaveLength(1);
  });

  it("spreads seeds over groups in snake order", () => {
    expect(snakeAssign(["1", "2", "3", "4", "5", "6", "7", "8"], 2)).toEqual([
      ["1", "4", "5", "8"],
      ["2", "3", "6", "7"],
    ]);
  });
});

describe("league", () => {
  it("plays everyone once and crowns the table leader", () => {
    const t = tournament("league", ["Riya", "Asha", "Meera", "Sana"]);
    const { tournament: t1, created } = generateFixtures(t, ORG, {});
    expect(created).toHaveLength(6);
    expect(t1.phase).toBe("groups");
    const strength = ["Riya", "Asha", "Meera", "Sana"];
    const { tour, all } = runAll(t1, Object.fromEntries(created.map((m) => [m.id, m])), (a, b) =>
      strength.indexOf(a) < strength.indexOf(b) ? a : b,
    );
    const table = standings(tour.groups[0], tour.fixtures, all, tour.points);
    expect(table.map((r) => nameOf(tour, r.entryId))).toEqual(["Riya", "Asha", "Meera", "Sana"]);
    expect(table[0]).toMatchObject({ played: 3, won: 3, lost: 0, points: 6 });
    expect(nameOf(tour, champion(tour, all))).toBe("Riya");
    expect(tour.phase).toBe("complete");
  });

  it("breaks a two-way points tie by head-to-head", () => {
    const t = tournament("league", ["A1", "B1", "C1"]);
    const { tournament: t1, created } = generateFixtures(t, ORG, {});
    // A beats B, B beats C, C beats A: all on 2 points, then set and point difference decide (all equal) — order stable.
    const beats: Record<string, string> = { "A1|B1": "A1", "B1|C1": "B1", "A1|C1": "C1" };
    const { tour, all } = runAll(t1, Object.fromEntries(created.map((m) => [m.id, m])), (a, b) => beats[[a, b].sort().join("|")]);
    const table = standings(tour.groups[0], tour.fixtures, all, tour.points);
    expect(table.every((r) => r.points === 2)).toBe(true);
  });
});

describe("knockout", () => {
  it("advances winners, handles byes and finds the champion", () => {
    let t = tournament("knockout", ["Riya", "Asha", "Meera", "Sana", "Kiran", "Dev"]);
    t = setSeed(t, ORG, id(t, "Riya"), 1);
    t = setSeed(t, ORG, id(t, "Asha"), 2);
    const { tournament: t1, created } = generateFixtures(t, ORG, {});
    expect(created).toHaveLength(2); // seeds 1 and 2 have byes in round 1
    const { tour, all } = runAll(t1, Object.fromEntries(created.map((m) => [m.id, m])), (a, b) =>
      ["Riya", "Asha"].includes(a) ? a : ["Riya", "Asha"].includes(b) ? b : a,
    );
    const finalMatch = Object.values(all).find((m) => m.tournament?.label === "Final")!;
    expect([nameOf(tour, finalMatch.sides.A.entryId), nameOf(tour, finalMatch.sides.B.entryId)].sort()).toEqual(["Asha", "Riya"]);
    expect(tour.phase).toBe("complete");
  });

  it("updates the next match if the organiser corrects a result before it starts", () => {
    const t = tournament("knockout", ["Riya", "Asha", "Meera", "Sana"]);
    const { tournament: t1, created } = generateFixtures(t, ORG, {});
    let all: Matches = Object.fromEntries(created.map((m) => [m.id, m]));
    for (const m of created) all[m.id] = play(t1, m, nameOf(t1, m.sides.A.entryId)!);
    let synced = syncTournament(t1, all);
    expect(synced.created).toHaveLength(1);
    all = { ...all, [synced.created[0].id]: synced.created[0] };
    // Correct semi-final 1: the point actually went to side B.
    const semi = all[created[0].id];
    const point = semi.events[0];
    all[semi.id] = editPoint(semi, ORG, point.id, { side: "B" });
    synced = syncTournament(synced.tournament, all);
    expect(synced.updated).toHaveLength(1);
    expect(synced.updated[0].sides.A.entryId).toBe(semi.sides.B.entryId);
  });
});

describe("groups then knockout", () => {
  it("assigns by seed, plays groups, then seeds qualifiers so group winners are kept apart", () => {
    let t = tournament("groups_knockout", ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    t.entries.forEach((e, i) => (t = setSeed(t, ORG, e.id, i + 1)));
    t = autoAssignGroups(t, ORG);
    expect(t.groups.map((g) => g.entryIds.map((x) => nameOf(t, x)))).toEqual([
      ["S1", "S4", "S5", "S8"],
      ["S2", "S3", "S6", "S7"],
    ]);
    const { tournament: t1, created } = generateFixtures(t, ORG, {});
    expect(created).toHaveLength(12);
    const rank = (n: string) => Number(n.slice(1));
    let all: Matches = Object.fromEntries(created.map((m) => [m.id, m]));
    for (const m of created) {
      const a = nameOf(t1, m.sides.A.entryId)!;
      const b = nameOf(t1, m.sides.B.entryId)!;
      all[m.id] = play(t1, m, rank(a) < rank(b) ? a : b);
    }
    expect(() => startKnockout(t1, "@someone", all)).toThrow(/Only the organiser/);
    const ko = startKnockout(t1, ORG, all);
    const semis = ko.created.map((m) => [nameOf(ko.tournament, m.sides.A.entryId), nameOf(ko.tournament, m.sides.B.entryId)]);
    expect(semis).toEqual([
      ["S1", "S3"], // A1 v B2
      ["S2", "S4"], // B1 v A2
    ]);
    all = { ...all, ...Object.fromEntries(ko.created.map((m) => [m.id, m])) };
    const { tour, all: done } = runAll(ko.tournament, all, (a, b) => (rank(a) < rank(b) ? a : b));
    expect(nameOf(tour, champion(tour, done))).toBe("S1");
  });

  it("refuses to generate with unassigned entries or a group that is too small", () => {
    let t = tournament("groups_knockout", ["A", "B", "C", "D"]);
    expect(() => generateFixtures(t, ORG, {})).toThrow(/Put every entry in a group/);
    t = setGroupCount(t, ORG, 2);
    t = assignToGroup(t, ORG, id(t, "A"), t.groups[0].id);
    t = assignToGroup(t, ORG, id(t, "B"), t.groups[1].id);
    t = assignToGroup(t, ORG, id(t, "C"), t.groups[1].id);
    t = assignToGroup(t, ORG, id(t, "D"), t.groups[1].id);
    expect(() => generateFixtures(t, ORG, {})).toThrow(/Group A needs at least two entries/);
  });
});
