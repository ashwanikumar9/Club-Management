import { describe, expect, it } from "vitest";
import { addEntry, createTournament, generateFixtures, setSeed } from "./mutations";
import {
  addEntries,
  autoSchedule,
  formatSchedule,
  importSchedule,
  parseBulkEntries,
  planSchedule,
  scheduleText,
  setFixtureSchedule,
  toMinutes,
  type AutoScheduleOptions,
} from "./schedule";
import type { Structure, Tournament } from "./types";

const ORG = "@org";
const QUICK = { pointsPerSet: 21, bestOf: 3, winBy: 2, cap: 30, decidingSetPoints: 21 };
const D = { matches: {}, ties: {} };

function tournament(structure: Structure, names: string[], format: Tournament["format"] = "singles"): Tournament {
  let t = createTournament({
    name: "City Open",
    sport: "badminton",
    format,
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

const OPTS: AutoScheduleOptions = {
  date: "2026-11-07",
  startTime: "09:00",
  endTime: "10:00",
  minutesPerMatch: 30,
  courts: ["Court 1", "Court 2"],
  restSlots: 1,
  onlyUnscheduled: false,
};

describe("auto-scheduler", () => {
  it("fills courts, never double-books a player and gives them a slot of rest", () => {
    const { tournament: t, created } = generateFixtures(tournament("league", ["A", "B", "C", "D", "E", "F"]), ORG, D);
    const plan = planSchedule(t, { matches: Object.fromEntries(created.map((m) => [m.id, m])), ties: {} }, OPTS);
    expect(plan.size).toBe(15);
    const bySlot = new Map<string, string[]>();
    for (const f of t.fixtures) {
      const s = plan.get(f.id)!;
      const key = `${s.date} ${s.time}`;
      const players = [f.a, f.b].map((x) => (x.type === "entry" ? x.entryId : ""));
      bySlot.set(key, [...(bySlot.get(key) ?? []), ...players]);
      expect(["Court 1", "Court 2"]).toContain(s.court);
    }
    for (const players of bySlot.values()) {
      expect(new Set(players).size).toBe(players.length); // nobody twice in a slot
      expect(players.length).toBeLessThanOrEqual(4); // two courts
    }
    // Rest: a player's consecutive matches are at least two slots apart.
    const slotsOf = new Map<string, number[]>();
    for (const f of t.fixtures) {
      const s = plan.get(f.id)!;
      const day = s.date === OPTS.date ? 0 : Math.round((Date.parse(s.date!) - Date.parse(OPTS.date)) / 86400000);
      const slot = day * 3 + (toMinutes(s.time!) - toMinutes(OPTS.startTime)) / 30;
      for (const x of [f.a, f.b]) if (x.type === "entry") slotsOf.set(x.entryId, [...(slotsOf.get(x.entryId) ?? []), slot]);
    }
    for (const slots of slotsOf.values()) {
      slots.sort((a, b) => a - b);
      for (let i = 1; i < slots.length; i++) expect(slots[i] - slots[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  it("rolls over to the next day after the last start time", () => {
    const { tournament: t, created } = generateFixtures(tournament("league", ["A", "B", "C", "D"]), ORG, D);
    const plan = planSchedule(t, { matches: Object.fromEntries(created.map((m) => [m.id, m])), ties: {} }, { ...OPTS, courts: ["Court 1"] });
    const days = new Set([...plan.values()].map((s) => s.date));
    expect(days.has("2026-11-07") && days.has("2026-11-08")).toBe(true);
    expect([...plan.values()].every((s) => toMinutes(s.time!) <= toMinutes("10:00"))).toBe(true);
  });

  it("places knockout rounds after the matches that feed them", () => {
    let t = tournament("knockout", ["A", "B", "C", "D", "E", "F", "G", "H"]);
    t = { ...t, thirdPlace: true };
    const { tournament: t1, created } = generateFixtures(t, ORG, D);
    const plan = planSchedule(t1, { matches: Object.fromEntries(created.map((m) => [m.id, m])), ties: {} }, { ...OPTS, endTime: "20:00", courts: ["C1", "C2", "C3", "C4"] });
    const time = (round: number) => t1.fixtures.filter((f) => f.round === round).map((f) => toMinutes(plan.get(f.id)!.time!));
    expect(Math.min(...time(2))).toBeGreaterThan(Math.max(...time(1)));
    expect(Math.min(...time(3))).toBeGreaterThan(Math.max(...time(2)));
  });

  it("copies the schedule onto matches and keeps manual times when asked", () => {
    const gen = generateFixtures(tournament("league", ["A", "B", "C"]), ORG, D);
    const data = { matches: Object.fromEntries(gen.created.map((m) => [m.id, m])), ties: {} };
    const first = gen.tournament.fixtures[0];
    const manual = setFixtureSchedule(gen.tournament, ORG, data, first.id, { date: "2026-11-07", time: "18:00", court: "Centre court" });
    expect(manual.matches[0].schedule).toEqual({ date: "2026-11-07", time: "18:00", court: "Centre court" });
    expect(manual.tournament.courts).toContain("Centre court");
    const auto = autoSchedule(manual.tournament, ORG, data, { ...OPTS, endTime: "20:00", onlyUnscheduled: true });
    expect(auto.tournament.fixtures.find((f) => f.id === first.id)!.schedule?.time).toBe("18:00");
    expect(auto.matches).toHaveLength(2);
    expect(() => autoSchedule(manual.tournament, "@someone", data, OPTS)).toThrow(/Only the organiser/);
    expect(() => planSchedule(gen.tournament, data, { ...OPTS, courts: [] })).toThrow(/at least one court/);
  });
});

describe("bulk entries", () => {
  it("reads singles, doubles and teams from pasted lines with seeds", () => {
    expect(parseBulkEntries("singles", "Riya Sharma | 1\nAsha\n\n").entries).toEqual([
      { name: "Riya Sharma", players: [{ name: "Riya Sharma" }], seed: 1 },
      { name: "Asha", players: [{ name: "Asha" }], seed: undefined },
    ]);
    expect(parseBulkEntries("doubles", "Meera / Karan\nSmashers: Sana & Rahul").entries.map((e) => e.name)).toEqual(["Meera / Karan", "Smashers"]);
    const team = parseBulkEntries("team", "Eagles: #7 Kiran, Arjun | 2").entries[0];
    expect(team).toEqual({ name: "Eagles", players: [{ jersey: "7", name: "Kiran" }, { name: "Arjun" }], seed: 2 });
    expect(parseBulkEntries("doubles", "Solo").errors[0]).toMatch(/needs two players/);
    expect(parseBulkEntries("team", "Kiran, Arjun").errors[0]).toMatch(/team name/);
  });

  it("reads spreadsheet rows (tab separated)", () => {
    expect(parseBulkEntries("team", "Eagles\tKiran\tArjun").entries[0]).toMatchObject({ name: "Eagles", players: [{ name: "Kiran" }, { name: "Arjun" }] });
  });

  it("adds them in one go, refusing duplicates", () => {
    let t = tournament("league", ["Riya"]);
    t = addEntries(t, ORG, parseBulkEntries("singles", "Asha | 1\nMeera").entries);
    expect(t.entries.map((e) => [e.name, e.seed])).toEqual([["Riya", undefined], ["Asha", 1], ["Meera", undefined]]);
    expect(() => addEntries(t, ORG, parseBulkEntries("singles", "riya").entries)).toThrow(/already in the tournament/);
  });
});

describe("schedule import", () => {
  it("matches pasted rows to fixtures by team names", () => {
    let t = tournament("league", ["Eagles", "Hawks", "Lions"]);
    t = setSeed(t, ORG, t.entries[0].id, 1);
    const gen = generateFixtures(t, ORG, D);
    const data = { matches: Object.fromEntries(gen.created.map((m) => [m.id, m])), ties: {} };
    const r = importSchedule(gen.tournament, ORG, data, "Hawks vs Eagles, 07/11/2026, 2:30 pm, Court 2\nLions\tHawks\t2026-11-08\t09:00\tCourt 1");
    const scheduled = r.tournament.fixtures.filter((f) => f.schedule);
    expect(scheduled.map((f) => f.schedule)).toEqual(
      expect.arrayContaining([
        { date: "2026-11-07", time: "14:30", court: "Court 2" },
        { date: "2026-11-08", time: "09:00", court: "Court 1" },
      ]),
    );
    expect(r.matches).toHaveLength(2);
    expect(() => importSchedule(gen.tournament, ORG, data, "Eagles vs Tigers, 2026-11-07, 10:00")).toThrow(/couldn't find "Tigers"/);
    expect(() => importSchedule(gen.tournament, ORG, data, "Eagles vs Hawks, 31-31-2026, 10:00")).toThrow(/date "31-31-2026" not understood/);
  });

  it("formats the schedule for sharing", () => {
    const gen = generateFixtures(tournament("league", ["A", "B"]), ORG, D);
    const data = { matches: Object.fromEntries(gen.created.map((m) => [m.id, m])), ties: {} };
    const r = setFixtureSchedule(gen.tournament, ORG, data, gen.tournament.fixtures[0].id, { date: "2026-11-07", time: "09:00", court: "Court 1" });
    const name = (id?: string) => r.tournament.entries.find((e) => e.id === id)?.name;
    expect(scheduleText(r.tournament, data, name)).toMatch(/Sat, 7 Nov\n09:00 · Court 1 {2}(A vs B|B vs A)/);
    expect(formatSchedule({ date: "2026-11-07", time: "09:00", court: "Court 1" })).toBe("Sat, 7 Nov · 09:00 · Court 1");
  });
});
