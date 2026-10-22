import { describe, expect, it } from "vitest";
import { buildCommentary } from "./commentary";
import { matchState } from "./engine";
import {
  addPoint,
  changeRules,
  closeMatch,
  createMatch,
  deletePoint,
  addScorer,
  editPoint,
  handOverScoring,
  insertPoint,
  MutationError,
  removeScorer,
  reopenMatch,
  setOutcome,
  setToss,
  setLatestPointDetail,
  startMatch,
  cancelTakeover,
  requestTakeover,
  respondToTakeover,
  settleTakeover,
  undoLast,
} from "./mutations";
import { SPORTS } from "./sports";
import type { Match, SideKey, SportKey } from "./types";

const ORG = "@org";
const NR = { type: "no_result" } as const;

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
      organiser: ORG,
    }),
    ORG,
  );
}

function score(match: Match, sequence: string): Match {
  let m = match;
  for (const ch of sequence) m = addPoint(m, ch as SideKey, ORG).match;
  return m;
}

const state = (m: Match) => matchState(m);

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
    expect(() => addPoint(m, "A", ORG)).toThrow(MutationError);
  });
});

describe("undo until close", () => {
  it("undoes repeatedly and re-opens a finished set", () => {
    let m = score(newMatch(), "A".repeat(21));
    const last = state(m).points.at(-1)!.event.id;
    m = undoLast(m, last, ORG);
    expect(state(m).sets).toEqual([{ A: 20, B: 0, winner: null }]);
    m = undoLast(m, state(m).points.at(-1)!.event.id, ORG);
    expect(state(m).sets[0].A).toBe(19);
  });

  it("refuses an undo when another scorer added a newer point", () => {
    let m = score(newMatch(), "A");
    const seen = state(m).points.at(-1)!.event.id;
    m = score(m, "B");
    expect(() => undoLast(m, seen, ORG)).toThrow(/score changed/);
  });

  it("blocks undo and scoring after close; organiser edits instead", () => {
    let m = closeMatch(score(newMatch(), "AAB"), ORG, NR);
    const id = state(m).points[2].event.id;
    expect(() => undoLast(m, id, ORG)).toThrow(MutationError);
    expect(() => editPoint(m, "@someone", id, { side: "A" })).toThrow(/Only the organiser/);
    m = editPoint(m, ORG, id, { side: "A" });
    expect(state(m).sets[0]).toMatchObject({ A: 3, B: 0 });
    expect(m.history.map((h) => h.kind)).toEqual(["close", "edit"]);
  });

  it("lets the organiser insert and delete points, and re-open", () => {
    let m = closeMatch(score(newMatch(), "AB"), ORG, NR);
    const [first, second] = state(m).points.map((p) => p.event.id);
    m = insertPoint(m, ORG, "B", second);
    expect(state(m).points.map((p) => p.event.side)).toEqual(["A", "B", "B"]);
    m = deletePoint(m, ORG, first);
    expect(state(m).sets[0]).toMatchObject({ A: 0, B: 2 });
    m = reopenMatch(m, ORG);
    expect(m.status).toBe("live");
  });
});

describe("point detail and commentary", () => {
  it("records how the point was won and renders commentary", () => {
    let m = newMatch();
    const added = addPoint(m, "A", ORG);
    m = setLatestPointDetail(added.match, ORG, added.event.id, { actionKey: "into_net" });
    const lines = buildCommentary(m, state(m));
    expect(lines.find((l) => l.id === added.event.id)?.text).toBe("Asha puts it into the net, point to Riya");
  });

  it("only allows detail on the latest point", () => {
    const first = addPoint(newMatch(), "A", ORG);
    const m = addPoint(first.match, "B", ORG).match;
    expect(() => setLatestPointDetail(m, ORG, first.event.id, { actionKey: "smash" })).toThrow(MutationError);
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
        organiser: ORG,
      }),
      ORG,
    );
    const added = addPoint(m, "A", ORG);
    m = setLatestPointDetail(added.match, ORG, added.event.id, { actorId: m.sides.A.players[0].id });
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

describe("changing rules", () => {
  const rules = SPORTS.badminton.rules;

  it("lets the scorer set the rules before the start", () => {
    const scheduled = createMatch({
      sport: "badminton",
      title: "",
      venue: "",
      livestreamUrl: "",
      format: "singles",
      rules,
      sides: { A: { name: "Riya", players: [] }, B: { name: "Asha", players: [] } },
      organiser: ORG,
    });
    const m = changeRules(scheduled, { ...rules, pointsPerSet: 15, decidingSetPoints: 15, cap: null }, ORG);
    expect(m.rules.pointsPerSet).toBe(15);
    expect(m.ruleChanges).toEqual([]);
  });

  it("applies a live change from the current set and keeps finished sets", () => {
    let m = score(newMatch(), "A".repeat(21) + "AB".repeat(5)); // game 1 won 21-0, game 2 at 5-5
    m = changeRules(m, { ...rules, pointsPerSet: 11, decidingSetPoints: 11, cap: 15 }, ORG);
    expect(state(m).sets[0]).toEqual({ A: 21, B: 0, winner: "A" });
    m = score(m, "AAAAA");
    expect(state(m).sets[1]).toEqual({ A: 10, B: 5, winner: null });
    m = score(m, "A");
    expect(state(m).winner).toBe("A");
    expect(m.history.at(-1)?.kind).toBe("rules");
    const texts = buildCommentary(m, state(m)).map((l) => l.text);
    expect(texts).toContain("Rules changed from Game 2: Games to 11 · win by 2 · cap 15 · best of 3");
  });

  it("refuses a change that would end the current set or match instantly", () => {
    const m = score(newMatch(), "A".repeat(12) + "B".repeat(3)); // 12-3
    expect(() => changeRules(m, { ...rules, pointsPerSet: 11, decidingSetPoints: 11, cap: null }, ORG)).toThrow(/end the current game immediately at 12–3/);
    const oneGame = score(newMatch(), "A".repeat(21));
    expect(() => changeRules(oneGame, { ...rules, bestOf: 1 }, ORG)).toThrow(MutationError);
  });

  it("validates rules and blocks changes after close", () => {
    const m = newMatch();
    expect(() => changeRules(m, { ...rules, bestOf: 4 }, ORG)).toThrow(/odd/);
    expect(() => changeRules(m, { ...rules, cap: 10 }, ORG)).toThrow(/cap/);
    expect(() => changeRules(closeMatch(m, ORG, NR), rules, ORG)).toThrow(/closed/);
  });

  it("can extend a match with a higher best of", () => {
    let m = score(newMatch(), "A".repeat(21) + "B".repeat(21) + "A".repeat(3));
    m = changeRules(m, { ...rules, bestOf: 5 }, ORG);
    m = score(m, "A".repeat(18));
    expect(state(m).winner).toBeNull(); // 2-1 in a best of 5
    expect(state(m).currentSet).toBe(3);
  });
});

describe("scoring access and control", () => {
  const SCORER = "+919876543210";
  const BACKUP = "backup@example.com";
  const t0 = new Date("2026-10-22T10:00:00Z");
  const after = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

  /** Gives SCORER control (organiser hands over directly). */
  const withScorer = () => handOverScoring(addScorer(newMatch(), ORG, SCORER), ORG, SCORER);

  it("lets only the active scorer change the score", () => {
    let m = addScorer(newMatch(), ORG, SCORER);
    expect(() => addPoint(m, "A", SCORER)).toThrow(/@org is scoring this match/);
    expect(() => addPoint(m, "A", "@stranger")).toThrow(/don't have scoring access/);
    m = handOverScoring(m, ORG, SCORER);
    m = addPoint(m, "A", SCORER).match;
    expect(() => addPoint(m, "A", ORG)).toThrow(/is scoring this match/);
    expect(state(m).sets[0].A).toBe(1);
  });

  it("passes scoring automatically when the scorer doesn't answer within 15 seconds", () => {
    let m = score2(withScorer(), SCORER, "AAB");
    m = addScorer(m, SCORER, BACKUP); // the scorer adds a backup before their battery dies
    m = requestTakeover(m, BACKUP, t0);
    expect(m.activeScorer).toBe(SCORER);
    expect(settleTakeover(m, after(14))).toBe(m); // still waiting
    m = settleTakeover(m, after(15));
    expect(m.activeScorer).toBe(BACKUP);
    expect(m.takeoverRequest?.status).toBe("auto");
    m = score2(m, BACKUP, "B");
    expect(state(m).sets[0]).toMatchObject({ A: 2, B: 2 });
    m = undoLast(m, state(m).points.at(-1)!.event.id, BACKUP); // full control, including undo
    expect(state(m).sets[0]).toMatchObject({ A: 2, B: 1 });
    expect(() => addPoint(m, "A", SCORER)).toThrow(/backup@example.com is scoring/);
    expect(m.history.at(-1)?.summary).toBe(
      "backup@example.com took over scoring from +919876543210 (no response within 15 seconds)",
    );
  });

  it("hands over at once when the scorer allows", () => {
    let m = requestTakeover(addScorer(withScorer(), ORG, BACKUP), BACKUP, t0);
    expect(() => respondToTakeover(m, BACKUP, true, after(2))).toThrow(/Only the current scorer/);
    m = respondToTakeover(m, SCORER, true, after(3));
    expect(m.activeScorer).toBe(BACKUP);
    expect(m.takeoverRequest?.status).toBe("allowed");
  });

  it("keeps the scorer in control when they decline in time", () => {
    let m = requestTakeover(addScorer(withScorer(), ORG, BACKUP), BACKUP, t0);
    m = score2(m, SCORER, "A"); // scoring continues while the request is open
    m = respondToTakeover(m, SCORER, false, after(10));
    expect(m.activeScorer).toBe(SCORER);
    expect(m.takeoverRequest?.status).toBe("declined");
    expect(settleTakeover(m, after(60))).toBe(m); // a declined request never auto-completes
    expect(() => addPoint(m, "A", BACKUP)).toThrow(/is scoring/);
  });

  it("treats an answer after the 15 seconds as too late", () => {
    let m = requestTakeover(addScorer(withScorer(), ORG, BACKUP), BACKUP, t0);
    m = respondToTakeover(m, SCORER, false, after(16));
    expect(m.activeScorer).toBe(BACKUP);
    expect(m.takeoverRequest?.status).toBe("auto");
  });

  it("allows one pending request at a time, cancelling, and immediate control when nobody scores", () => {
    let m = addScorer(addScorer(withScorer(), ORG, BACKUP), ORG, "@third");
    m = requestTakeover(m, BACKUP, t0);
    expect(() => requestTakeover(m, "@third", after(1))).toThrow(/backup@example.com has already asked/);
    expect(() => requestTakeover(m, BACKUP, after(1))).toThrow(/already asked/);
    m = cancelTakeover(m, BACKUP, after(2));
    expect(settleTakeover(m, after(30)).activeScorer).toBe(SCORER);
    m = removeScorer(m, ORG, SCORER); // nobody is scoring now
    m = requestTakeover(m, "@third", after(40));
    expect(m.activeScorer).toBe("@third");
  });

  it("cancels a pending request when control changes another way", () => {
    let m = requestTakeover(addScorer(addScorer(withScorer(), ORG, BACKUP), ORG, "@third"), BACKUP, t0);
    m = handOverScoring(m, SCORER, "@third");
    expect(m.takeoverRequest?.status).toBe("cancelled");
    expect(settleTakeover(m, after(20)).activeScorer).toBe("@third");
  });

  it("lets the organiser take over at once without asking, overriding a pending request", () => {
    let m = requestTakeover(addScorer(withScorer(), ORG, BACKUP), BACKUP, t0);
    m = requestTakeover(m, ORG, after(1));
    expect(m.activeScorer).toBe(ORG);
    expect(m.takeoverRequest?.status).toBe("cancelled");
    expect(settleTakeover(m, after(30)).activeScorer).toBe(ORG);
    expect(m.history.at(-1)?.summary).toBe("Organiser @org took over scoring from +919876543210");
  });

  it("lets the organiser replace a scorer who keeps declining", () => {
    let m = addScorer(withScorer(), ORG, BACKUP);
    m = removeScorer(m, ORG, SCORER); // no permission needed
    m = addScorer(m, ORG, "@newscorer");
    m = requestTakeover(m, "@newscorer"); // nobody is scoring, so control is immediate
    expect(m.activeScorer).toBe("@newscorer");
  });

  it("refuses scorers without access and duplicate access", () => {
    const m = newMatch();
    expect(() => addScorer(m, "@stranger", SCORER)).toThrow(/don't have scoring access/);
    expect(() => addScorer(addScorer(m, ORG, SCORER), ORG, SCORER)).toThrow(/already has scoring access/);
    expect(() => requestTakeover(m, "@stranger")).toThrow(/don't have scoring access/);
  });

  it("lets only the organiser remove a scorer, which also ends their control", () => {
    let m = withScorer();
    expect(() => removeScorer(m, SCORER, SCORER)).toThrow(/Only the organiser/);
    m = removeScorer(m, ORG, SCORER);
    expect(m.activeScorer).toBeUndefined();
    expect(() => requestTakeover(m, SCORER)).toThrow(/don't have scoring access/);
  });
});

function score2(match: Match, by: string, sequence: string): Match {
  let m = match;
  for (const ch of sequence) m = addPoint(m, ch as SideKey, by).match;
  return m;
}

describe("retirements, walkovers and no result", () => {
  it("awards a retirement to the opponent and records it in commentary", () => {
    let m = score(newMatch(), "A".repeat(21) + "BBB");
    expect(() => closeMatch(m, ORG)).toThrow(/Choose how the match ended/);
    m = closeMatch(m, ORG, { type: "retired", winner: "B" });
    expect(state(m).winner).toBe("B");
    expect(state(m).setsWon).toEqual({ A: 1, B: 0 }); // the score stays as played
    expect(buildCommentary(m, state(m)).at(-1)?.text).toBe("Riya retired, Asha wins.");
  });

  it("allows a walkover before the match starts", () => {
    const scheduled = createMatch({
      sport: "badminton",
      title: "",
      venue: "",
      livestreamUrl: "",
      format: "singles",
      rules: SPORTS.badminton.rules,
      sides: { A: { name: "Riya", players: [] }, B: { name: "Asha", players: [] } },
      organiser: ORG,
    });
    expect(() => closeMatch(scheduled, ORG, { type: "retired", winner: "A" })).toThrow(/walkover or no result/);
    const m = closeMatch(scheduled, ORG, { type: "walkover", winner: "A" });
    expect(state(m).winner).toBe("A");
    expect(m.history.at(-1)?.summary).toBe("Match closed (Walkover, Riya wins (Asha did not play))");
  });

  it("records no result without a winner and requires a winner for the other outcomes", () => {
    const m = closeMatch(score(newMatch(), "AB"), ORG, NR);
    expect(state(m).winner).toBeNull();
    expect(() => closeMatch(score(newMatch(), "AB"), ORG, { type: "retired" })).toThrow(/Choose who is awarded/);
    expect(() => closeMatch(score(newMatch(), "A".repeat(42)), ORG, NR)).toThrow(/already has a winner/);
  });

  it("lets the organiser change the recorded outcome, and re-opening clears it", () => {
    let m = closeMatch(score(newMatch(), "AB"), ORG, { type: "retired", winner: "A" });
    expect(() => setOutcome(m, "@someone", NR)).toThrow(/Only the organiser/);
    m = setOutcome(m, ORG, { type: "retired", winner: "B" });
    expect(state(m).winner).toBe("B");
    m = reopenMatch(m, ORG);
    expect(m.outcome).toBeUndefined();
    expect(state(m).winner).toBeNull();
  });
});

describe("toss, serving and ends", () => {
  const servers = (m: Match) => state(m).points.map((p) => p.server).join("");

  it("badminton: the rally winner serves, and the game winner serves first in the next game", () => {
    let m = setToss(newMatch(), ORG, { winner: "B", choice: "receive", firstServer: "A", left: "A" });
    m = score(m, "ABBA");
    expect(servers(m)).toBe("AABB");
    expect(state(m).server).toBe("A");
    m = score(m, "B".repeat(21)); // B wins game 1 (2–23 → wins at 21+)
    expect(state(m).sets[0].winner).toBe("B");
    expect(state(m).server).toBe("B");
    expect(state(m).left).toBe("B"); // ends changed after the game
  });

  it("table tennis: service alternates every two points, every point at deuce, and the receiver serves first next game", () => {
    let m = newMatch("table_tennis");
    m = setToss(m, ORG, { firstServer: "A", left: "A" });
    m = score(m, "ABABABABABAB"); // 6–6
    expect(servers(m)).toBe("AABBAABBAABB");
    m = score(m, "ABABABAB"); // 10–10
    m = score(m, "AB"); // deuce: alternate every point
    expect(state(m).points.slice(-2).map((p) => p.server)).toEqual(["A", "B"]);
    m = score(m, "AA"); // A wins 13–11
    expect(state(m).sets[0].winner).toBe("A");
    expect(state(m).server).toBe("B");
  });

  it("changes ends halfway through the deciding game and says so", () => {
    let m = setToss(newMatch(), ORG, { firstServer: "A", left: "A" });
    m = score(m, "A".repeat(21) + "B".repeat(21)); // 1–1 in games
    expect(state(m).left).toBe("A"); // switched twice
    m = score(m, "A".repeat(10));
    expect(state(m).left).toBe("A");
    m = score(m, "A");
    expect(state(m).left).toBe("B");
    expect(buildCommentary(m, state(m)).map((l) => l.text)).toContain("Change of ends");
  });

  it("can only be set before the first point and announces the choice", () => {
    let m = setToss(newMatch(), ORG, { winner: "B", choice: "serve", firstServer: "B", left: "A" });
    expect(buildCommentary(m, state(m)).map((l) => l.text)).toContain("Asha won the toss and chose to serve. Asha to serve first.");
    m = score(m, "A");
    expect(() => setToss(m, ORG, { firstServer: "A", left: "A" })).toThrow(/before the first point/);
    expect(state(score(newMatch(), "AB")).server).toBeNull(); // no toss, no tracking
  });
});
