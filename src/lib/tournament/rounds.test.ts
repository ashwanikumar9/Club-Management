import { describe, expect, it } from "vitest";
import { addPoint, closeMatch, startMatch } from "../rally/mutations";
import type { Match } from "../rally/types";
import { champion, standings, type Data } from "./engine";
import { addEntry, autoAssignGroups, createTournament, generateFixtures, setSeed, startKnockout, syncTournament } from "./mutations";
import { addFixture, addStage, deleteFixture, removeStage, setFixtureSides, swapFixtureSides } from "./rounds";
import type { Tournament } from "./types";

const ORG = "@org";
const QUICK = { pointsPerSet: 1, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 1 };

function setup(structure: Tournament["structure"], names: string[]) {
  let t = createTournament({
    name: "Club Champs",
    sport: "badminton",
    format: "singles",
    venue: "",
    startDate: "",
    organiser: ORG,
    rules: QUICK,
    points: { win: 2, loss: 0 },
    structure,
  });
  for (const n of names) t = addEntry(t, ORG, n, [{ name: n }]);
  t.entries.forEach((e, i) => (t = setSeed(t, ORG, e.id, i + 1)));
  if (structure === "groups_knockout") t = autoAssignGroups(t, ORG);
  const gen = generateFixtures(t, ORG, { matches: {}, ties: {} });
  return { t: gen.tournament, data: { matches: Object.fromEntries(gen.created.map((m) => [m.id, m])), ties: {} } as Data };
}

const id = (t: Tournament, name: string) => t.entries.find((e) => e.name === name)!.id;
const nameOf = (t: Tournament, entryId?: string) => t.entries.find((e) => e.id === entryId)?.name;

/** Plays every open match of the tournament: the lower seed number (earlier in the list) wins. */
function playAll(t: Tournament, data: Data, filter: (m: Match) => boolean = () => true) {
  const all = { ...data.matches };
  for (const m of Object.values(all)) {
    if (m.status !== "scheduled" || !filter(m)) continue;
    const seedA = t.entries.find((e) => e.id === m.sides.A.entryId)!.seed!;
    const seedB = t.entries.find((e) => e.id === m.sides.B.entryId)!.seed!;
    all[m.id] = closeMatch(addPoint(startMatch(m, ORG), seedA < seedB ? "A" : "B", ORG).match, ORG);
  }
  return { ...data, matches: all };
}

describe("extra rounds", () => {
  it("adds a plate knockout for teams that didn't qualify, without touching the main event", () => {
    let { t, data } = setup("groups_knockout", ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]);
    data = playAll(t, data);
    const ko = startKnockout(t, ORG, data);
    t = ko.tournament;
    data = { ...data, matches: { ...data.matches, ...Object.fromEntries(ko.created.map((m) => [m.id, m])) } };
    const plate = addStage(t, ORG, data, { name: "Plate", kind: "knockout", entryIds: ["S5", "S6", "S7", "S8"].map((n) => id(t, n)) });
    t = plate.tournament;
    expect(plate.matches.map((m) => m.tournament?.label)).toEqual(["Plate · Semi-finals 1", "Plate · Semi-finals 2"]);
    data = { ...data, matches: { ...data.matches, ...Object.fromEntries(plate.matches.map((m) => [m.id, m])) } };

    for (let round = 0; round < 2; round++) {
      data = playAll(t, data);
      const s = syncTournament(t, data);
      t = s.tournament;
      data = { ...data, matches: { ...data.matches, ...Object.fromEntries(s.created.map((m) => [m.id, m])) } };
    }
    expect(nameOf(t, champion(t, data))).toBe("S1"); // main event unaffected
    const plateFinal = Object.values(data.matches).find((m) => m.tournament?.label === "Plate · Final")!;
    expect([plateFinal.sides.A.name, plateFinal.sides.B.name].sort()).toEqual(["S5", "S6"]);
    expect(t.phase).toBe("complete");
  });

  it("adds a round-robin round in groups with its own table", () => {
    const { t, data } = setup("league", ["A", "B", "C", "D"]);
    const r = addStage(t, ORG, data, { name: "Super 4", kind: "league", entryIds: t.entries.map((e) => e.id), groupCount: 1 });
    const stage = r.tournament.stages[0];
    expect(stage.groups).toHaveLength(1);
    expect(r.matches).toHaveLength(6);
    expect(r.matches[0].tournament?.label).toMatch(/^Super 4 · Round 1$/);
    const played = playAll(r.tournament, { ...data, matches: { ...data.matches, ...Object.fromEntries(r.matches.map((m) => [m.id, m])) } }, (m) => !!m.tournament?.label.startsWith("Super 4"));
    const table = standings(stage.groups[0], r.tournament.fixtures, played, r.tournament.points);
    expect(table.map((row) => nameOf(t, row.entryId))).toEqual(["A", "B", "C", "D"]);
    // The main league table only counts main fixtures.
    expect(standings(r.tournament.groups[0], r.tournament.fixtures, played, r.tournament.points).every((row) => row.played === 0)).toBe(true);
  });

  it("supports one-off matches and refuses duplicate names, too few entries and removing a started round", () => {
    const { t, data } = setup("league", ["A", "B", "C"]);
    expect(() => addStage(t, ORG, data, { name: "League", kind: "knockout", entryIds: [id(t, "A")] })).toThrow(/at least two/);
    let r = addStage(t, ORG, data, { name: "Exhibition", kind: "matches", entryIds: [] });
    const stageId = r.tournament.stages[0].id;
    r = addFixture(r.tournament, ORG, data, { stageId }, id(t, "A"), id(t, "C"));
    expect(r.matches[0].tournament?.label).toBe("Exhibition · Match 1");
    expect(() => addStage(r.tournament, ORG, data, { name: "exhibition", kind: "matches", entryIds: [] })).toThrow(/already a round/);
    const started = { ...data, matches: { ...data.matches, [r.matches[0].id]: startMatch(r.matches[0], ORG) } };
    expect(() => removeStage(r.tournament, ORG, started, stageId)).toThrow(/have started/);
    const removed = removeStage(r.tournament, ORG, data, stageId);
    expect(removed.tournament.stages).toHaveLength(0);
    expect(removed.deleteMatches).toEqual([r.matches[0].id]);
  });
});

describe("editing fixtures", () => {
  it("adds a match to a group and counts it in the table", () => {
    const { t, data } = setup("league", ["A", "B", "C"]);
    const r = addFixture(t, ORG, data, { groupId: t.groups[0].id }, id(t, "A"), id(t, "B"));
    expect(r.matches).toHaveLength(1);
    const played = playAll(r.tournament, { ...data, matches: { ...data.matches, [r.matches[0].id]: r.matches[0] } }, (m) => m.id === r.matches[0].id);
    const row = standings(r.tournament.groups[0], r.tournament.fixtures, played, r.tournament.points).find((x) => x.entryId === id(t, "A"))!;
    expect(row.played).toBe(1);
  });

  it("re-pairs and swaps a fixture before it starts, updating its match", () => {
    const { t, data } = setup("knockout", ["A", "B", "C", "D"]);
    const f = t.fixtures.find((x) => x.round === 1)!;
    const swapped = swapFixtureSides(t, ORG, data, f.id);
    const match = swapped.matches.find((m) => m.id === f.matchId)!;
    expect(match.sides.A.entryId).toBe(f.b.type === "entry" ? f.b.entryId : "");
    const repaired = setFixtureSides(t, ORG, data, f.id, id(t, "A"), id(t, "C"));
    expect(repaired.matches.find((m) => m.id === f.matchId)!.sides.B.name).toBe("C");
    const live = { ...data, matches: { ...data.matches, [f.matchId!]: startMatch(data.matches[f.matchId!], ORG) } };
    expect(() => setFixtureSides(t, ORG, live, f.id, id(t, "B"), id(t, "C"))).toThrow(/has started/);
    expect(() => setFixtureSides(t, "@someone", data, f.id, id(t, "B"), id(t, "C"))).toThrow(/Only the organiser/);
  });

  it("deletes fixtures that don't feed a later round", () => {
    const { t, data } = setup("knockout", ["A", "B", "C", "D"]);
    const semi = t.fixtures.find((x) => x.round === 1)!;
    expect(() => deleteFixture(t, ORG, data, semi.id)).toThrow(/decides a later round/);
    const league = setup("league", ["A", "B", "C"]);
    const f = league.t.fixtures[0];
    const r = deleteFixture(league.t, ORG, league.data, f.id);
    expect(r.tournament.fixtures).toHaveLength(2);
    expect(r.deleteMatches).toEqual([f.matchId]);
  });
});
