import { describe, expect, it } from "vitest";
import { createCard, updateCard } from "../players/cards";
import { addPoint, closeMatch, createMatch, startMatch } from "../rally/mutations";
import type { Match } from "../rally/types";
import { addEntry, createTournament, generateFixtures } from "../tournament/mutations";
import { createMeet } from "../meet/meet";
import { createRegistration } from "../meet/registration";
import { meetReport, playerReport, previousMonth, tournamentReport } from "./report";

const ORG = "@org";
const QUICK = { pointsPerSet: 2, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 2 };
const { card: plain, contacts } = createCard({ name: "Riya <b>", contacts: ["+919876543210"], sports: ["badminton"], by: ORG });
const card = updateCard(plain, contacts, ORG, { birthYear: new Date().getFullYear() - 20, profiles: { badminton: { style: "Attacking" } } });

function played(opponent: string, winner: "A" | "B"): Match {
  let m = createMatch({
    sport: "badminton",
    title: "",
    venue: "",
    livestreamUrl: "",
    format: "singles",
    rules: QUICK,
    sides: { A: { name: "Riya", players: [{ name: "Riya", cardId: card.id }] }, B: { name: opponent, players: [{ name: opponent }] } },
    organiser: ORG,
  });
  m = startMatch(m, ORG);
  for (let i = 0; i < 2; i++) m = addPoint(m, winner, ORG).match;
  return closeMatch(m, ORG);
}

describe("report emails", () => {
  const m1 = played("Asha", "A");
  const m2 = played("Meera", "B");
  const data = { matches: { [m1.id]: m1, [m2.id]: m2 }, ties: {} };

  it("sums up a player's record, sports and results, with names escaped", () => {
    const r = playerReport(card, data, [], "https://x.test");
    expect(r.subject).toBe("Riya <b>: performance report");
    expect(r.html).toContain("Riya &lt;b&gt;");
    expect(r.html).not.toContain("Riya <b>");
    expect(r.html).toContain("Age 20");
    expect(r.html).toContain("Badminton: Attacking");
    expect(r.text).toContain("All time: played 2, won 1 (50%)");
    expect(r.text).toMatch(/vs Asha: won 2–0/);
    expect(r.html).toContain("https://x.test/players/" + card.id);
  });

  it("adds the month block for the monthly summary", () => {
    const now = new Date();
    const month = { start: new Date(now.getTime() - 86400000), end: new Date(now.getTime() + 86400000), label: "This month" };
    const r = playerReport(card, data, [], "https://x.test", month);
    expect(r.subject).toBe("Riya <b>: your This month summary");
    expect(r.text).toContain("This month: played 2, won 1");
    expect(previousMonth(new Date(Date.UTC(2026, 0, 15))).label).toBe("December 2025");
  });

  it("reports a tournament's entries and progress to the organiser", () => {
    let t = createTournament({ name: "City Open", sport: "badminton", format: "singles", venue: "", startDate: "", organiser: ORG, rules: QUICK, points: { win: 2, loss: 0 }, structure: "league" });
    for (const n of ["A", "B", "C"]) t = addEntry(t, ORG, n, [{ name: n }]);
    const gen = generateFixtures(t, ORG, { matches: {}, ties: {} });
    const r = tournamentReport(gen.tournament, { matches: Object.fromEntries(gen.created.map((m) => [m.id, m])), ties: {} }, "https://x.test");
    expect(r.subject).toBe("City Open: tournament report");
    expect(r.text).toContain("Entries 3");
  });
});

describe("meet report", () => {
  it("shows the organiser every event and an event admin only theirs, with waiting requests", () => {
    const { meet, tournaments } = createMeet({
      name: "College Meet",
      venue: "Ground",
      city: "Patna",
      startDate: "2026-11-10",
      endDate: "2026-11-12",
      organiser: ORG,
      events: [
        { sport: "badminton", format: "singles", admins: ["+919000000001"] },
        { sport: "volleyball", format: "team" },
      ],
      registration: { open: true },
    });
    const reg = createRegistration(meet, { eventId: meet.events[0].id, captain: "cap@example.com", teamName: "", players: [{ name: "Riya" }], formDone: true }, []);
    const byId = Object.fromEntries(tournaments.map((t) => [t.id, t]));
    const all = meetReport(meet, byId, { matches: {}, ties: {} }, [reg], ORG, "https://x.test");
    expect(all.text).toContain("Badminton · Singles: 0 entries, 1 waiting");
    expect(all.text).toContain("Volleyball · Team");
    const admin = meetReport(meet, byId, { matches: {}, ties: {} }, [reg], "+919000000001", "https://x.test");
    expect(admin.text).not.toContain("Volleyball · Team");
  });
});

describe("report email code", () => {
  it("only confirms with the right code, for the same person, before it expires", async () => {
    process.env.CRON_SECRET = "test-secret";
    const { issueCode, checkCode } = await import("./server");
    const { code, token } = issueCode("+919876543210", "riya@example.com");
    expect(checkCode(token, code, "+919876543210")).toEqual({ email: "riya@example.com" });
    expect(checkCode(token, code === "000000" ? "111111" : "000000", "+919876543210")).toEqual({ error: "That code isn't right." });
    expect(checkCode(token, code, "+910000000000")).toMatchObject({ error: expect.stringMatching(/Start again/) });
    expect(checkCode("junk", code, "+919876543210")).toMatchObject({ error: expect.stringMatching(/Start again/) });
  });
});
