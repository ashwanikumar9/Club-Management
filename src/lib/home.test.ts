import { describe, expect, it } from "vitest";
import { eventStatus, knownCities, nearYou, yourEvents } from "./home";
import { createMeet } from "./meet/meet";
import { createRegistration } from "./meet/registration";
import { addEntry, createTournament } from "./tournament/mutations";
import type { Tournament } from "./tournament/types";

const ORG = "org@example.com";
const ME = "me@example.com";
const QUICK = { pointsPerSet: 1, bestOf: 1, winBy: 1, cap: null, decidingSetPoints: 1 };

function tournament(name: string, city: string, organiser = ORG): Tournament {
  return createTournament({ name, sport: "badminton", format: "singles", venue: "", startDate: "2099-01-01", organiser, rules: QUICK, points: { win: 2, loss: 0 }, structure: "knockout", city });
}

describe("home page lists", () => {
  const meetR = createMeet({ name: "City Meet", venue: "", city: "Patna", startDate: "2099-02-01", organiser: ORG, events: [{ sport: "badminton", format: "singles" }] });
  const inMeet = Object.fromEntries(meetR.tournaments.map((t) => [t.id, t]));
  const meets = { [meetR.meet.id]: meetR.meet };

  it("shows events I run, play in, registered for, or opened", () => {
    const own = tournament("Mine", "Delhi", ME);
    const played = addEntry(tournament("Played", "Delhi"), ORG, "Me", [{ name: "Me", cardId: "card1" }]);
    const viewed = tournament("Viewed", "Delhi");
    const other = tournament("Other", "Delhi");
    const all = { ...inMeet, [own.id]: own, [played.id]: played, [viewed.id]: viewed, [other.id]: other };
    const reg = createRegistration(meetR.meet, { eventId: meetR.meet.events[0].id, captain: ME, teamName: "", players: [{ name: "Me" }], formDone: true }, []);
    const names = yourEvents(ME, meets, all, [reg], ["card1"], [viewed.id]).map((i) => (i.kind === "meet" ? i.meet.name : i.t.name));
    expect(names.sort()).toEqual(["City Meet", "Mine", "Played", "Viewed"]);
  });

  it("finds live and upcoming events in my city, not the meet's own tournaments separately", () => {
    const patna = tournament("Patna Open", "patna");
    const delhi = tournament("Delhi Open", "Delhi");
    const all = { ...inMeet, [patna.id]: patna, [delhi.id]: delhi };
    expect(nearYou(" Patna ", meets, all).map((i) => i.id).sort()).toEqual([meetR.meet.id, patna.id].sort());
    expect(nearYou("", meets, all)).toEqual([]);
    expect(knownCities(meets, all)).toEqual(["Delhi", "Patna"]);
  });

  it("works out whether an event is on now, upcoming or finished", () => {
    const t = tournament("T", "X");
    expect(eventStatus({ kind: "tournament", t, id: t.id }, {}, "2026-10-23")).toBe("upcoming");
    expect(eventStatus({ kind: "tournament", t: { ...t, phase: "groups" }, id: t.id }, {}, "2026-10-23")).toBe("live");
    expect(eventStatus({ kind: "meet", meet: meetR.meet, id: meetR.meet.id }, inMeet, "2099-02-01")).toBe("live");
    expect(eventStatus({ kind: "meet", meet: meetR.meet, id: meetR.meet.id }, inMeet, "2099-03-01")).toBe("finished");
  });
});
