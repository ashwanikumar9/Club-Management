import { describe, expect, it } from "vitest";
import { addMembers, canManageTeam, createTeam, joinTeam, myTeams, parseSquadList, removeMember, resetInvite, setCaptain, setTeamAdmins } from "./teams";

const CAP = "cap@example.com";

describe("teams", () => {
  const team = createTeam({ name: "Smashers", sport: "badminton", city: "Patna", by: CAP }, []);

  it("needs a name and a unique name per sport and city", () => {
    expect(() => createTeam({ name: " ", sport: "badminton", city: "", by: CAP }, [])).toThrow(/name/);
    expect(() => createTeam({ name: "smashers", sport: "badminton", city: "patna", by: CAP }, [team])).toThrow(/already a badminton team/);
    expect(() => createTeam({ name: "Smashers", sport: "volleyball", city: "Patna", by: CAP }, [team])).not.toThrow();
  });

  it("lets admins add, remove and pick a captain", () => {
    let t = addMembers(team, CAP, [
      { cardId: "c1", name: "Riya" },
      { cardId: "c2", name: "Asha" },
      { cardId: "c1", name: "Riya again" },
    ]);
    expect(t.players.map((p) => p.name)).toEqual(["Riya", "Asha"]);
    expect(() => addMembers(t, "someone@example.com", [{ cardId: "c3", name: "X" }])).toThrow(/admins/);
    t = setCaptain(t, CAP, "c2");
    expect(() => setCaptain(t, CAP, "c9")).toThrow(/squad/);
    t = removeMember(t, CAP, "c2");
    expect(t.captainCardId).toBeUndefined();
    t = setTeamAdmins(t, CAP, ["vice@example.com"]);
    expect(canManageTeam(t, "vice@example.com")).toBe(true);
    expect(() => setTeamAdmins(t, "vice@example.com", [])).toThrow(/created the team/);
  });

  it("lets anyone with the invite link join, once", () => {
    let t = joinTeam(team, team.inviteCode, { cardId: "c5", name: "Meera" });
    t = joinTeam(t, team.inviteCode, { cardId: "c5", name: "Meera" });
    expect(t.players).toHaveLength(1);
    expect(() => joinTeam(team, "wrong", { cardId: "c6", name: "X" })).toThrow(/no longer valid/);
    const fresh = resetInvite(t, CAP);
    expect(() => joinTeam(fresh, team.inviteCode, { cardId: "c6", name: "X" })).toThrow(/no longer valid/);
    expect(myTeams([t], "meera@example.com", ["c5"])).toHaveLength(1);
  });

  it("reads pasted squad lists", () => {
    const { rows, errors } = parseSquadList("Riya Sharma, 98765 43210\nAsha\t+919812345678\nDev\n\nMeera, meera@example.com");
    expect(rows).toEqual([
      { name: "Riya Sharma", contact: "98765 43210" },
      { name: "Asha", contact: "+919812345678" },
      { name: "Meera", contact: "meera@example.com" },
    ]);
    expect(errors).toEqual(['Line 3: add a mobile number after the name ("Dev").']);
  });
});
