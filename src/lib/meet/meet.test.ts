import { describe, expect, it } from "vitest";
import { addEntry, generateFixtures } from "../tournament/mutations";
import { addMeetEvent, canManageEvent, createMeet, removeMeetEvent, setEventAdmins, updateMeet } from "./meet";
import { approveRegistration, createRegistration, pendingFor, rejectRegistration } from "./registration";
import type { Registration } from "./types";

const ORG = "org@example.com";
const ADMIN = "+919000000001";
const CAPTAIN = "captain@example.com";

function meet() {
  return createMeet({
    name: "College Sports Meet",
    venue: "Main Ground",
    city: "Patna",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    organiser: ORG,
    events: [
      { sport: "badminton", format: "singles", admins: [ADMIN] },
      { sport: "volleyball", format: "team", template: "beach" },
      { sport: "table_tennis", format: "team" },
    ],
    registration: { open: true, formUrl: "forms.gle/abc123", info: "Fee ₹200 per team" },
  });
}

describe("sports meets", () => {
  it("creates one tournament per event, with the event's admins in charge", () => {
    const { meet: m, tournaments } = meet();
    expect(m.events.map((e) => e.name)).toEqual(["Badminton · Singles", "Volleyball · Team", "Table Tennis · Team"]);
    expect(m.registration.formUrl).toBe("https://forms.gle/abc123");
    const [bad, vb, tt] = tournaments;
    expect(bad.id).toBe(m.events[0].tournamentId);
    expect(bad.admins).toEqual([ADMIN]);
    expect(bad.scorers).toEqual([ADMIN]);
    expect(bad.meet).toEqual({ id: m.id, name: m.name, eventId: m.events[0].id });
    expect(bad.city).toBe("Patna");
    expect(vb.rules.switchEvery).toBe(7); // beach template
    expect(tt.tieSystem).toBe("swaythling");
    expect(canManageEvent(m, m.events[0], ADMIN)).toBe(true);
    expect(canManageEvent(m, m.events[1], ADMIN)).toBe(false);
  });

  it("validates the basics", () => {
    expect(() => createMeet({ name: "", venue: "", city: "", startDate: "", organiser: ORG, events: [] })).toThrow(/name/);
    expect(() => createMeet({ name: "X", venue: "", city: "", startDate: "", organiser: ORG, events: [] })).toThrow(/at least one sport/);
    expect(() =>
      createMeet({ name: "X", venue: "", city: "", startDate: "", organiser: ORG, events: [{ sport: "volleyball", format: "singles" }] }),
    ).toThrow(/no singles/);
    expect(() =>
      createMeet({
        name: "X",
        venue: "",
        city: "",
        startDate: "",
        organiser: ORG,
        events: [{ sport: "badminton", format: "singles" }],
        registration: { open: true, formUrl: "not a link" },
      }),
    ).toThrow(/valid link/);
  });

  it("lets only the organiser change events and admins", () => {
    const { meet: m, tournaments } = meet();
    expect(() => addMeetEvent(m, ADMIN, { sport: "badminton", format: "doubles" })).toThrow(/organiser/);
    const added = addMeetEvent(m, ORG, { sport: "badminton", format: "doubles" });
    expect(added.meet.events).toHaveLength(4);
    expect(() => addMeetEvent(added.meet, ORG, { sport: "badminton", format: "doubles" })).toThrow(/already an event/);
    const r = setEventAdmins(m, ORG, m.events[1].id, ["vb@example.com"], tournaments[1]);
    expect(r.tournament.admins).toEqual(["vb@example.com"]);
    expect(r.tournament.scorers).toContain("vb@example.com");
    const withEntry = addEntry(tournaments[0], ORG, "Riya", [{ name: "Riya" }]);
    expect(() => removeMeetEvent(m, ORG, m.events[0].id, withEntry)).toThrow(/already has teams/);
    expect(removeMeetEvent(m, ORG, m.events[2].id, tournaments[2]).events).toHaveLength(2);
    expect(updateMeet(m, ORG, { registration: { open: false } }).registration).toMatchObject({ open: false, formUrl: "https://forms.gle/abc123" });
  });
});

describe("team registration", () => {
  it("requires the form, then waits for the organiser or event admin", () => {
    const { meet: m, tournaments } = meet();
    const event = m.events[0];
    const base = { eventId: event.id, captain: CAPTAIN, teamName: "", players: [{ name: "Riya Sharma" }], formDone: false };
    expect(() => createRegistration(m, base, [])).toThrow(/form first/);
    expect(() => createRegistration(m, { ...base, captain: "@riya", formDone: true }, [])).toThrow(/mobile number or email/);
    const reg = createRegistration(m, { ...base, formDone: true }, []);
    expect(reg).toMatchObject({ status: "pending", teamName: "Riya Sharma" });
    expect(() => createRegistration(m, { ...base, formDone: true }, [reg])).toThrow(/already registered/);

    expect(pendingFor([m], [reg], ADMIN)).toHaveLength(1);
    expect(pendingFor([m], [reg], "someone@example.com")).toHaveLength(0);
    expect(() => approveRegistration(m, reg, tournaments[0], "someone@example.com")).toThrow(/Only the organiser/);

    const ok = approveRegistration(m, reg, tournaments[0], ADMIN);
    expect(ok.registration.status).toBe("approved");
    expect(ok.tournament.entries.map((e) => e.name)).toEqual(["Riya Sharma"]);
    expect(ok.registration.entryId).toBe(ok.tournament.entries[0].id);
    expect(() => approveRegistration(m, ok.registration, ok.tournament, ORG)).toThrow(/already approved/);
  });

  it("can be rejected with a reason, and closed registration refuses requests", () => {
    const { meet: m } = meet();
    const team = m.events[1];
    const reg = createRegistration(m, { eventId: team.id, captain: CAPTAIN, teamName: "Sharks", players: [{ name: "A" }, { name: "B" }], formDone: true }, []);
    const rejected = rejectRegistration(m, reg, ORG, "Fee not paid");
    expect(rejected).toMatchObject({ status: "rejected", reason: "Fee not paid" });
    // A rejected team may apply again.
    expect(() => createRegistration(m, { ...reg, captain: CAPTAIN, formDone: true }, [rejected as Registration])).not.toThrow();
    const closed = updateMeet(m, ORG, { registration: { open: false } });
    expect(() => createRegistration(closed, { eventId: team.id, captain: CAPTAIN, teamName: "X", players: [{ name: "A" }], formDone: true }, [])).toThrow(/closed/);
  });

  it("can't add teams once fixtures exist", () => {
    const { meet: m, tournaments } = meet();
    let t = addEntry(tournaments[0], ORG, "A", [{ name: "A" }]);
    t = addEntry(t, ORG, "B", [{ name: "B" }]);
    t = generateFixtures({ ...t, structure: "knockout" }, ORG, { matches: {}, ties: {} }).tournament;
    const reg = createRegistration(m, { eventId: m.events[0].id, captain: CAPTAIN, teamName: "C", players: [{ name: "C" }], formDone: true }, []);
    expect(() => approveRegistration(m, reg, t, ORG)).toThrow(/already generated/);
  });
});
