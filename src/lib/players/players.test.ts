import { describe, expect, it } from "vitest";
import { addPoint, closeMatch, createMatch, setLatestPointDetail, startMatch } from "../rally/mutations";
import { SPORTS } from "../rally/sports";
import type { Match } from "../rally/types";
import { addEntry, createTournament, generateFixtures } from "../tournament/mutations";
import { addContact, ageOf, canEditCard, createCard, maskContact, myCards, profileSummary, searchCards, updateCard } from "./cards";
import { playerStats } from "./stats";

const ORG = "@org";
const QUICK = { pointsPerSet: 2, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 2 };

describe("player cards", () => {
  it("needs a name and a mobile number or email", () => {
    expect(() => createCard({ name: "Riya", contacts: [], by: ORG })).toThrow(/mobile number or email/);
    expect(() => createCard({ name: "Riya", contacts: ["@riya"], by: ORG })).toThrow(/isn't a mobile number or email/);
    expect(() => createCard({ name: " ", contacts: ["+919876543210"], by: ORG })).toThrow(/name/);
    const { card, contacts } = createCard({ name: "Riya Sharma", contacts: ["+919876543210", "riya@example.com"], by: ORG });
    expect(card.contactHints).toEqual(["+91 ••••• 43210", "r•••@example.com"]);
    expect(contacts.map((c) => c.contact)).toEqual(["+919876543210", "riya@example.com"]);
    expect(JSON.stringify(card)).not.toContain("9876543210"); // the public card never holds the number
  });

  it("belongs to whoever signs in with one of its contacts", () => {
    const { card, contacts } = createCard({ name: "Riya", contacts: ["riya@example.com"], by: ORG });
    expect(myCards([card], contacts, "riya@example.com")).toEqual([card]);
    expect(myCards([card], contacts, "+919999999999")).toEqual([]);
    expect(canEditCard(card, contacts, ORG)).toBe(true);
    expect(canEditCard(card, contacts, "riya@example.com")).toBe(true);
    expect(() => updateCard(card, contacts, "@someone", { name: "X" })).toThrow(/Only the player/);
    const r = addContact(card, contacts, "riya@example.com", "+919876543210");
    expect(r.card.contactHints).toHaveLength(2);
    expect(() => addContact(card, contacts, ORG, "riya@example.com")).toThrow(/already/);
  });

  it("lets the player set their age and how they play each sport", () => {
    const { card, contacts } = createCard({ name: "Riya", contacts: ["riya@example.com"], sports: ["badminton"], hand: "left", by: ORG });
    expect(profileSummary(card, "badminton")).toBe("Left-handed"); // older card-wide hand still shows
    const year = new Date().getFullYear() - 24;
    const next = updateCard(card, contacts, "riya@example.com", {
      name: "Riya S.",
      birthYear: year,
      sports: ["badminton", "table_tennis"],
      profiles: { badminton: { hand: "Right-handed", style: "Attacking", event: "Nonsense" }, table_tennis: { grip: "Penhold" } },
      hand: null,
    });
    expect(next.name).toBe("Riya S.");
    expect(ageOf(next)).toBe(24);
    expect(next.profiles).toEqual({ badminton: { hand: "Right-handed", style: "Attacking" }, table_tennis: { grip: "Penhold" } });
    expect(profileSummary(next, "badminton")).toBe("Right-handed · Attacking");
    expect(() => updateCard(card, contacts, "riya@example.com", { birthYear: 1800 })).toThrow(/year of birth/);
    expect(updateCard(next, contacts, "riya@example.com", { birthYear: null }).birthYear).toBeUndefined();
  });

  it("searches by name and hides hidden cards from others", () => {
    const a = createCard({ name: "Riya", contacts: ["riya@example.com"], by: ORG });
    const b = createCard({ name: "Asha", contacts: ["asha@example.com"], by: ORG });
    const hidden = updateCard(b.card, b.contacts, ORG, { hidden: true });
    const contacts = [...a.contacts, ...b.contacts];
    expect(searchCards([a.card, hidden], "", "@x", contacts).map((c) => c.name)).toEqual(["Riya"]);
    expect(searchCards([a.card, hidden], "as", "asha@example.com", contacts).map((c) => c.name)).toEqual(["Asha"]);
  });

  it("masks numbers without a country code length too", () => {
    expect(maskContact("+6591234567")).toBe("+••••• 34567");
  });
});

describe("player stats", () => {
  const riya = createCard({ name: "Riya", contacts: ["riya@example.com"], by: ORG }).card;

  function match(opponent: string, sides: "riyaA" | "riyaB" = "riyaA"): Match {
    const me = { name: "Riya", players: [{ name: "Riya", cardId: riya.id }] };
    const them = { name: opponent, players: [{ name: opponent }] };
    return createMatch({
      sport: "badminton",
      title: "",
      venue: "",
      livestreamUrl: "",
      format: "singles",
      rules: QUICK,
      sides: sides === "riyaA" ? { A: me, B: them } : { A: them, B: me },
      organiser: ORG,
    });
  }

  function play(m: Match, winner: "A" | "B", shot?: string): Match {
    let x = startMatch(m, ORG);
    for (let i = 0; i < 2; i++) {
      const r = addPoint(x, winner, ORG);
      x = r.match;
      if (shot) {
        const actor = x.sides[winner].players[0].id;
        x = setLatestPointDetail(x, ORG, r.event.id, { actionKey: shot, actorId: actor });
      }
    }
    return closeMatch(x, ORG);
  }

  it("counts wins, games, points, form and winning shots across matches", () => {
    const m1 = play(match("Asha"), "A", "smash");
    const m2 = play(match("Meera", "riyaB"), "A");
    const m3 = match("Sana");
    const stats = playerStats(riya.id, { matches: { [m1.id]: m1, [m2.id]: m2, [m3.id]: m3 }, ties: {} }, []);
    expect(stats.played).toBe(2);
    expect(stats.won).toBe(1);
    expect(stats.bySport[0]).toMatchObject({ sport: "badminton", gamesWon: 1, gamesLost: 1, pointsWon: 2, pointsLost: 2 });
    expect(stats.form.sort()).toEqual(["L", "W"]);
    expect(stats.upcoming.map((a) => a.match.id)).toEqual([m3.id]);
    expect(stats.topShots).toEqual([{ label: SPORTS.badminton.actions[0].label, count: 2 }]);
  });

  it("awards a medal for a tournament the player won", () => {
    let t = createTournament({
      name: "Club night",
      sport: "badminton",
      format: "singles",
      venue: "",
      startDate: "",
      organiser: ORG,
      rules: QUICK,
      points: { win: 2, loss: 0 },
      structure: "knockout",
    });
    t = addEntry(t, ORG, "Riya", [{ name: "Riya", cardId: riya.id }]);
    t = addEntry(t, ORG, "Asha", [{ name: "Asha" }]);
    const r = generateFixtures(t, ORG, { matches: {}, ties: {} });
    const final = r.created[0];
    const riyaSide = final.sides.A.players[0].cardId === riya.id ? "A" : "B";
    const played = play(final, riyaSide);
    const stats = playerStats(riya.id, { matches: { [played.id]: played }, ties: {} }, [r.tournament]);
    expect(stats.medals.map((m) => m.place)).toEqual([1]);
  });
});
