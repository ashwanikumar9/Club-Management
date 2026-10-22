import { describe, expect, it } from "vitest";
import { rankGroup, type GroupResult } from "./ranking";

const POINTS = { win: 2, loss: 0 };

/** A best-of-5 style result: `sets` like "3-1", points per side optional. */
function res(a: string, b: string, sets: string, opts: Partial<GroupResult> = {}): GroupResult {
  const [x, y] = sets.split("-").map(Number);
  return {
    a,
    b,
    winner: x > y ? "A" : "B",
    score: { A: x, B: y },
    games: { A: x, B: y },
    points: { A: x * 11, B: y * 11 },
    team: false,
    setsToWin: 3,
    setPoints: 25,
    ...opts,
  };
}

const order = (rows: { entryId: string }[]) => rows.map((r) => r.entryId).join("");

describe("BWF ranking (GCR 16)", () => {
  it("ranks by matches won, two level by head-to-head", () => {
    const results = [res("A", "B", "0-2"), res("A", "C", "2-0"), res("B", "C", "0-2"), res("A", "D", "2-0"), res("B", "D", "2-0"), res("C", "D", "0-2")];
    // A 2 wins, B 2 wins (beat A), C 1, D 1 (beat C)
    const rows = rankGroup(["A", "B", "C", "D"], results, POINTS, "bwf");
    expect(order(rows)).toBe("BADC");
    expect(rows[0].points).toBe(2);
  });

  it("separates three level players by game difference", () => {
    const results = [res("A", "B", "2-0"), res("B", "C", "2-1"), res("C", "A", "2-1")];
    // One win each. Games: A 3-2 (+1), C 3-3 (0), B 2-3 (-1).
    expect(order(rankGroup(["A", "B", "C"], results, POINTS, "bwf"))).toBe("ACB");
  });

  it("deletes every result of a player who retires and ranks them last", () => {
    const results = [res("A", "B", "2-0"), res("C", "A", "1-0", { kind: "retired" }), res("B", "C", "2-0")];
    // A retired against C: A's results (including the win over B) are deleted.
    const rows = rankGroup(["A", "B", "C"], results, POINTS, "bwf");
    expect(order(rows)).toBe("BCA");
    expect(rows[2].withdrawn).toBe(true);
    expect(rows[0].played).toBe(1);
  });
});

describe("ITTF ranking (3.7.5)", () => {
  it("gives 2 for a win, 1 for a played loss and 0 for a walkover", () => {
    const rows = rankGroup(["A", "B", "C"], [res("A", "B", "3-1"), res("A", "C", "0-0", { winner: "A", kind: "walkover" })], POINTS, "ittf");
    const byId = Object.fromEntries(rows.map((r) => [r.entryId, r.points]));
    expect(byId).toEqual({ A: 4, B: 1, C: 0 });
  });

  it("separates level players using only the matches between them", () => {
    const results = [
      res("A", "B", "3-0"),
      res("B", "C", "3-0"),
      res("C", "A", "3-2"),
      // Everyone beats D; C wins big, which would help C on whole-group ratios but must not count.
      res("A", "D", "3-2"),
      res("B", "D", "3-2"),
      res("C", "D", "3-0", { points: { A: 33, B: 0 } }),
    ];
    // Among A, B, C: games A 5-3, B 3-3, C 3-5.
    expect(order(rankGroup(["A", "B", "C", "D"], results, POINTS, "ittf"))).toBe("ABCD");
  });
});

describe("FIVB ranking", () => {
  it("awards 3/0 for 3-0 or 3-1 and 2/1 for 3-2", () => {
    const rows = rankGroup(["A", "B", "C"], [res("A", "B", "3-2"), res("C", "B", "3-1")], POINTS, "fivb");
    const byId = Object.fromEntries(rows.map((r) => [r.entryId, r.points]));
    expect(byId).toEqual({ A: 2, B: 1, C: 3 });
    expect(order(rows)).toBe("CAB");
  });

  it("ranks by wins before match points", () => {
    const results = [res("A", "B", "3-2"), res("A", "C", "3-2"), res("B", "C", "3-0"), res("C", "D", "3-0"), res("B", "D", "3-0"), res("D", "A", "3-0")];
    // A: 2 wins, 4 pts; B: 2 wins, 7 pts; C: 1 win; D: 1 win
    expect(order(rankGroup(["A", "B", "C", "D"], results, POINTS, "fivb")).slice(0, 2)).toBe("BA");
  });

  it("records a forfeit as 3-0 with 25-0 sets", () => {
    const [row] = rankGroup(["A", "B"], [res("A", "B", "0-0", { winner: "A", kind: "walkover", points: { A: 0, B: 0 } })], POINTS, "fivb");
    expect(row).toMatchObject({ entryId: "A", points: 3, setsFor: 3, setsAgainst: 0, pointsFor: 75 });
  });
});

describe("Custom ranking", () => {
  it("uses the organiser's points and head-to-head for two level entries", () => {
    const results = [res("A", "B", "0-3"), res("A", "C", "3-0"), res("B", "C", "0-3")];
    const rows = rankGroup(["A", "B", "C"], results, { win: 3, loss: 1 }, "custom");
    expect(rows.every((r) => r.points === 4)).toBe(true);
  });
});
