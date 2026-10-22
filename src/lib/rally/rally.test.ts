import { describe, expect, it } from "vitest";
import { buildCommentary } from "./commentary";
import { computeState } from "./engine";
import {
  addPoint,
  closeMatch,
  createMatch,
  deletePoint,
  editPoint,
  insertPoint,
  MutationError,
  reopenMatch,
  setLatestPointDetail,
  startMatch,
  undoLast,
} from "./mutations";
import { SPORTS } from "./sports";
import type { Match, SideKey, SportKey } from "./types";

function newMatch(sport: SportKey = "badminton", format: Match["format"] = "singles"): Match {
  return startMatch(
    createMatch({
      sport,
      title: "",
      venue: "",
      livestreamUrl: "",
      format,
      rules: SPORTS[sport].rules,
      sides: {
        A: { name: "Riya", players: [{ name: "Riya" }] },
        B: { name: "Asha", players: [{ name: "Asha" }] },
      },
    }),
  );
}

function score(match: Match, sequence: string): Match {
  let m = match;
  for (const ch of sequence) m = addPoint(m, ch as SideKey, "test").match;
  return m;
}

const state = (m: Match) => computeState(m.events, m.rules);

describe("rally engine", () => {
  it("wins a badminton game at 21 with a 2 point lead", () => {
    const m = score(newMatch(), "A".repeat(21));
    const s = state(m);
    expect(s.sets[0]).toEqual({ A: 21, B: 0, winner: "A" });
    expect(s.setsWon).toEqual({ A: 1, B: 0 });
    expect(s.sets[1]).toEqual({ A: 0, B: 0, winner: null });
  });

  it("requires win by 2 and stops at the 30 point cap", () => {
    const deuce = score(newMatch(), "AB".repeat(20)); // 20-20
    expect(state(score(deuce, "A")).sets[0].winner).toBeNull(); // 21-20
    expect(state(score(deuce, "AA")).sets[0].winner).toBe("A"); // 22-20
    const capped = score(newMatch(), "AB".repeat(29)); // 29-29
    expect(state(capped).setPoint).toBe("A");
    expect(state(score(capped, "B")).sets[0]).toEqual({ A: 29, B: 30, winner: "B" });
  });

  it("uses deciding set points for the last volleyball set", () => {
    let m = newMatch("volleyball", "team");
    m = score(m, "A".repeat(25) + "B".repeat(25) + "A".repeat(25) + "B".repeat(25));
    expect(state(m).currentSet).toBe(4);
    m = score(m, "A".repeat(15));
    const s = state(m);
    expect(s.winner).toBe("A");
    expect(s.sets[4]).toEqual({ A: 15, B: 0, winner: "A" });
  });

  it("detects set point and match point", () => {
    let m = score(newMatch("table_tennis"), "A".repeat(10));
    expect(state(m).setPoint).toBe("A");
    expect(state(m).matchPoint).toBeNull();
    m = score(m, "A" + "A".repeat(11) + "A".repeat(10)); // 2 games won, 10-0 in game 3
    expect(state(m).matchPoint).toBe("A");
  });

  it("refuses points after the match is decided", () => {
    const m = score(newMatch(), "A".repeat(42));
    expect(state(m).winner).toBe("A");
    expect(() => addPoint(m, "A", "test")).toThrow(MutationError);
  });
});

describe("undo until close", () => {
  it("undoes repeatedly and re-opens a finished set", () => {
    let m = score(newMatch(), "A".repeat(21));
    const last = state(m).points.at(-1)!.event.id;
    m = undoLast(m, last, "test");
    expect(state(m).sets).toEqual([{ A: 20, B: 0, winner: null }]);
    m = undoLast(m, state(m).points.at(-1)!.event.id, "test");
    expect(state(m).sets[0].A).toBe(19);
  });

  it("refuses an undo when another scorer added a newer point", () => {
    let m = score(newMatch(), "A");
    const seen = state(m).points.at(-1)!.event.id;
    m = score(m, "B");
    expect(() => undoLast(m, seen, "test")).toThrow(/score changed/);
  });

  it("blocks undo and scoring after close; organiser edits instead", () => {
    let m = closeMatch(score(newMatch(), "AAB"), "scorer");
    const id = state(m).points[2].event.id;
    expect(() => undoLast(m, id, "test")).toThrow(MutationError);
    expect(() => editPoint(m, "scorer", "x", id, { side: "A" })).toThrow(/Only the organiser/);
    m = editPoint(m, "organiser", "org", id, { side: "A" });
    expect(state(m).sets[0]).toMatchObject({ A: 3, B: 0 });
    expect(m.history.map((h) => h.kind)).toEqual(["close", "edit"]);
  });

  it("lets the organiser insert and delete points, and re-open", () => {
    let m = closeMatch(score(newMatch(), "AB"), "scorer");
    const [first, second] = state(m).points.map((p) => p.event.id);
    m = insertPoint(m, "organiser", "org", "B", second);
    expect(state(m).points.map((p) => p.event.side)).toEqual(["A", "B", "B"]);
    m = deletePoint(m, "organiser", "org", first);
    expect(state(m).sets[0]).toMatchObject({ A: 0, B: 2 });
    m = reopenMatch(m, "organiser", "org");
    expect(m.status).toBe("live");
  });
});

describe("point detail and commentary", () => {
  it("records how the point was won and renders commentary", () => {
    let m = newMatch();
    const added = addPoint(m, "A", "test");
    m = setLatestPointDetail(added.match, added.event.id, { actionKey: "into_net" });
    const lines = buildCommentary(m, state(m));
    expect(lines.find((l) => l.id === added.event.id)?.text).toBe("Asha puts it into the net, point to Riya");
  });

  it("only allows detail on the latest point", () => {
    const first = addPoint(newMatch(), "A", "test");
    const m = addPoint(first.match, "B", "test").match;
    expect(() => setLatestPointDetail(m, first.event.id, { actionKey: "smash" })).toThrow(MutationError);
  });

  it("credits the chosen player in team matches", () => {
    let m = startMatch(
      createMatch({
        sport: "volleyball",
        title: "",
        venue: "",
        livestreamUrl: "",
        format: "team",
        rules: SPORTS.volleyball.rules,
        sides: {
          A: { name: "Eagles", players: [{ name: "Kiran", jersey: "7" }] },
          B: { name: "Hawks", players: [{ name: "Dev", jersey: "4" }] },
        },
      }),
    );
    const added = addPoint(m, "A", "test");
    m = setLatestPointDetail(added.match, added.event.id, { actorId: m.sides.A.players[0].id });
    expect(buildCommentary(m, state(m)).at(-1)?.text).toBe("#7 Kiran scores a point for Eagles");
  });

  it("announces set and match results", () => {
    const m = score(newMatch(), "A".repeat(42));
    const texts = buildCommentary(m, state(m)).map((l) => l.text);
    expect(texts).toContain("Game 1 to Riya, 21–0. Games: 1–0");
    expect(texts).toContain("Match point, Riya!");
    expect(texts.at(-1)).toBe("Riya wins the match 2–0 (21–0, 21–0)");
  });
});
