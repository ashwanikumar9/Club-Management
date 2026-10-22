import { describe, expect, it } from "vitest";
import { addPoint, closeMatch, startMatch } from "../rally/mutations";
import type { Match, SideKey } from "../rally/types";
import { addTieScorer, createSlotMatch, createTie, setLetters, setLineup, setPlayAll, tieState, type Matches } from "./tie";
import type { Tie } from "./types";

const ORG = "@org";
const QUICK = { pointsPerSet: 1, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 1 };
const team = (name: string, players: string[]) => ({ name, players: players.map((p) => ({ name: p })) });

function newTie(lineupMode: "advance" | "at_start" = "at_start", matchCount = 5): Tie {
  return createTie({
    sport: "badminton",
    title: "",
    venue: "",
    rules: QUICK,
    teams: { A: team("Eagles", ["Riya", "Asha", "Meera", "Sana"]), B: team("Hawks", ["Kiran", "Dev", "Yash"]) },
    matchCount,
    lineupMode,
    lineups:
      lineupMode === "advance"
        ? [
            { format: "singles", A: [0], B: [0] },
            { format: "singles", A: [1], B: [1] },
            { format: "doubles", A: [0, 1], B: [0, 1] },
            { format: "singles", A: [2], B: [2] },
            { format: "doubles", A: [2, 3], B: [1, 2] },
          ].slice(0, matchCount) as { format: "singles" | "doubles"; A: number[]; B: number[] }[]
        : undefined,
    organiser: ORG,
  });
}

const pid = (t: Tie, side: SideKey, name: string) => t.teams[side].players.find((p) => p.name === name)!.id;

/** Creates (if needed), starts and wins slot `index` for `winner`. */
function playSlot(t: Tie, all: Matches, index: number, winner: SideKey): { tie: Tie; all: Matches } {
  let tie = t;
  let match: Match;
  if (tie.slots[index].matchId) match = all[tie.slots[index].matchId!];
  else ({ tie, match } = createSlotMatch(tie, ORG, index, all));
  match = closeMatch(addPoint(startMatch(match, ORG), winner, ORG).match, ORG);
  return { tie, all: { ...all, [match.id]: match } };
}

describe("team ties", () => {
  it("needs an odd number of matches, two named teams and players", () => {
    expect(() => newTie("at_start", 4)).toThrow(/odd number/);
    expect(() =>
      createTie({ sport: "badminton", title: "", venue: "", rules: QUICK, teams: { A: team("X", []), B: team("Y", ["a"]) }, matchCount: 3, lineupMode: "at_start", organiser: ORG }),
    ).toThrow(/Add at least one player to X/);
  });

  it("stops once a team wins the majority and marks the rest not needed", () => {
    let t = newTie("advance");
    let all: Matches = {};
    for (const i of [0, 1, 2]) ({ tie: t, all } = playSlot(t, all, i, "A"));
    const s = tieState(t, all);
    expect(s.score).toEqual({ A: 3, B: 0 });
    expect(s.winner).toBe("A");
    expect(s.complete).toBe(true);
    expect(s.slots.slice(3).map((v) => v.status)).toEqual(["not_needed", "not_needed"]);
    expect(() => createSlotMatch(t, ORG, 3, all)).toThrow(/isn't needed/);
  });

  it("plays the remaining matches when the organiser chooses to", () => {
    let t = newTie("advance");
    let all: Matches = {};
    for (const i of [0, 1, 2]) ({ tie: t, all } = playSlot(t, all, i, "B"));
    expect(() => setPlayAll(t, "@someone", true)).toThrow(/Only the organiser/);
    t = setPlayAll(t, ORG, true);
    expect(tieState(t, all).complete).toBe(false);
    ({ tie: t, all } = playSlot(t, all, 3, "A"));
    ({ tie: t, all } = playSlot(t, all, 4, "A"));
    const s = tieState(t, all);
    expect(s.score).toEqual({ A: 2, B: 3 });
    expect(s.winner).toBe("B");
    expect(s.complete).toBe(true);
  });

  it("uses line-ups set in advance, and never asks who scored", () => {
    const t = newTie("advance");
    expect(t.slots[2]).toMatchObject({ format: "doubles" });
    const { match } = createSlotMatch(t, ORG, 2, {});
    expect(match.format).toBe("doubles");
    expect(match.sides.A.name).toBe("Riya / Asha");
    expect(match.sides.B.name).toBe("Kiran / Dev");
    expect(match.settings.askWho).toBe(false);
    expect(match.tie).toMatchObject({ index: 2, teams: { A: "Eagles", B: "Hawks" } });
  });

  it("lets the scorer pick singles/doubles and the players when each match starts", () => {
    let t = newTie("at_start");
    expect(() => createSlotMatch(t, ORG, 0, {})).toThrow(/Set the line-up first/);
    expect(() => setLineup(t, ORG, 0, "doubles", { A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Kiran"), pid(t, "B", "Dev")] }, {})).toThrow(
      /two different players from Eagles/,
    );
    expect(() => setLineup(t, "@stranger", 0, "singles", { A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Kiran")] }, {})).toThrow(/scoring access/);
    t = setLineup(t, ORG, 0, "singles", { A: [pid(t, "A", "Meera")], B: [pid(t, "B", "Yash")] }, {});
    const { tie, match } = createSlotMatch(t, ORG, 0, {});
    expect(match.sides.A.name).toBe("Meera");
    expect(match.format).toBe("singles");
    expect(() => setLineup(tie, ORG, 0, "singles", { A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Kiran")] }, {})).toThrow(/already been created/);
  });

  it("counts retirements and walkovers as match wins and totals games and points", () => {
    let t = newTie("advance", 3);
    let all: Matches = {};
    ({ tie: t, all } = playSlot(t, all, 0, "A"));
    const made = createSlotMatch(t, ORG, 1, all);
    t = made.tie;
    all[made.match.id] = closeMatch(made.match, ORG, { type: "walkover", winner: "A" });
    const s = tieState(t, all);
    expect(s.score).toEqual({ A: 2, B: 0 });
    expect(s.winner).toBe("A");
    expect(s.games).toEqual({ A: 1, B: 0 });
    expect(s.points).toEqual({ A: 1, B: 0 });
  });

  it("gives new tie scorers access to existing open matches", () => {
    const made = createSlotMatch(newTie("advance"), ORG, 0, {});
    const r = addTieScorer(made.tie, ORG, "@court1", { [made.match.id]: made.match });
    expect(r.tie.scorers).toEqual(["@court1"]);
    expect(r.matches[0].scorers.map((s) => s.user)).toEqual(["@court1"]);
  });
});

describe("official team systems", () => {
  function systemTie(system: string, sport: "badminton" | "table_tennis" = "table_tennis"): Tie {
    return createTie({
      sport,
      title: "",
      venue: "",
      rules: QUICK,
      teams: { A: team("Eagles", ["Riya", "Asha", "Meera"]), B: team("Hawks", ["Kiran", "Dev", "Yash"]) },
      matchCount: 1,
      system,
      lineupMode: "advance",
      organiser: ORG,
    });
  }

  it("lays out Thomas Cup ties as S1, D1, S2, D2, S3 with fixed formats", () => {
    const t = systemTie("thomas_uber", "badminton");
    expect(t.matchCount).toBe(5);
    expect(t.lineupMode).toBe("at_start");
    expect(t.slots.map((s) => s.format)).toEqual(["singles", "doubles", "singles", "doubles", "singles"]);
    expect(() => setLineup(t, ORG, 1, "singles", { A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Dev")] }, {})).toThrow(/doubles in the Thomas/);
  });

  it("fills Swaythling singles from the captains' letters", () => {
    let t = systemTie("swaythling");
    t = setLetters(t, ORG, "A", { A: pid(t, "A", "Riya"), B: pid(t, "A", "Asha"), C: pid(t, "A", "Meera") });
    expect(t.slots[0].players).toBeUndefined(); // team B's letters still missing
    t = setLetters(t, ORG, "B", { X: pid(t, "B", "Kiran"), Y: pid(t, "B", "Dev"), Z: pid(t, "B", "Yash") });
    expect(t.slots.map((s) => s.label)).toEqual(["A v X", "B v Y", "C v Z", "A v Y", "B v X"]);
    expect(t.slots[3].players).toEqual({ A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Dev")] });
    expect(() => setLetters(t, ORG, "A", { A: pid(t, "A", "Riya"), B: pid(t, "A", "Riya") })).toThrow(/different player/);
    expect(() => setLineup(t, ORG, 0, "singles", { A: [pid(t, "A", "Asha")], B: [pid(t, "B", "Dev")] }, {})).toThrow(/team letters/);
  });

  it("locks a letter once its match has started", () => {
    let t = systemTie("corbillon");
    t = setLetters(t, ORG, "A", { A: pid(t, "A", "Riya"), B: pid(t, "A", "Asha") });
    t = setLetters(t, ORG, "B", { X: pid(t, "B", "Kiran"), Y: pid(t, "B", "Dev") });
    ({ tie: t } = createSlotMatch(t, ORG, 0, {}));
    expect(() => setLetters(t, ORG, "A", { A: pid(t, "A", "Meera"), B: pid(t, "A", "Asha") })).toThrow(/already started/);
  });

  it("allows at most two matches per player in the Olympic system", () => {
    let t = systemTie("olympic");
    t = setLetters(t, ORG, "A", { A: pid(t, "A", "Riya"), B: pid(t, "A", "Asha"), C: pid(t, "A", "Meera") });
    t = setLetters(t, ORG, "B", { X: pid(t, "B", "Kiran"), Y: pid(t, "B", "Dev"), Z: pid(t, "B", "Yash") });
    t = setLineup(t, ORG, 2, "doubles", { A: [pid(t, "A", "Meera"), pid(t, "A", "Riya")], B: [pid(t, "B", "Yash"), pid(t, "B", "Kiran")] }, {});
    expect(() => setLineup(t, ORG, 3, "singles", { A: [pid(t, "A", "Riya")], B: [pid(t, "B", "Yash")] }, {})).toThrow(/Riya would play 3/);
  });
});
