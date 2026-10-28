import { MutationError, newId } from "../rally/mutations";
import { SPORTS } from "../rally/sports";
import type { SportKey } from "../rally/types";

/**
 * A team that lasts beyond one event (like a CricHeroes team): one sport, a squad of player cards, admins who
 * manage it and a captain. Picked whole when entering a tournament, a sports meet or a team tie.
 */
export interface TeamMember {
  cardId: string;
  /** Name at the time of joining (the card holds the current name). */
  name: string;
  jersey?: string;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  sport: SportKey;
  city: string;
  /** Who created the team. */
  organiser: string;
  /** Other people who manage the team (the database lets organiser and these write). */
  scorers: string[];
  /** Player card of the captain. */
  captainCardId?: string;
  players: TeamMember[];
  /** Secret part of the invite link; anyone with the link can join after signing in. */
  inviteCode: string;
  createdAt: string;
  version: number;
}

const now = () => new Date().toISOString();
const code = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

export function createTeam(input: { name: string; sport: SportKey; city: string; by: string }, existing: Team[]): Team {
  const name = input.name.trim();
  if (!name) throw new MutationError("Give the team a name.");
  if (!SPORTS[input.sport]) throw new MutationError("Choose a sport.");
  const city = input.city.trim();
  const clash = existing.find((t) => t.sport === input.sport && t.name.toLowerCase() === name.toLowerCase() && t.city.toLowerCase() === city.toLowerCase());
  if (clash) throw new MutationError(`There is already a ${SPORTS[input.sport].name.toLowerCase()} team called ${clash.name}${city ? ` in ${city}` : ""}. Pick that team or use another name.`);
  return { id: newId(), name, sport: input.sport, city, organiser: input.by, scorers: [], players: [], inviteCode: code(), createdAt: now(), version: 0 };
}

export function canManageTeam(team: Pick<Team, "organiser" | "scorers">, user: string | null): boolean {
  return !!user && (team.organiser === user || team.scorers.includes(user));
}

function requireAdmin(team: Team, by: string) {
  if (!canManageTeam(team, by)) throw new MutationError("Only the team's admins can change the team.");
}

/** Adds players (already resolved to cards). Players already in the squad are skipped. */
export function addMembers(team: Team, by: string, members: { cardId: string; name: string; jersey?: string }[]): Team {
  requireAdmin(team, by);
  const players = [...team.players];
  for (const m of members) {
    if (players.some((p) => p.cardId === m.cardId)) continue;
    players.push({ cardId: m.cardId, name: m.name.trim(), jersey: m.jersey?.trim() || undefined, joinedAt: now() });
  }
  return { ...team, players };
}

/** A signed-in player joins through the invite link (no approval needed). */
export function joinTeam(team: Team, codeGiven: string, member: { cardId: string; name: string }): Team {
  if (codeGiven !== team.inviteCode) throw new MutationError("This invite link is no longer valid. Ask the captain for a new one.");
  if (team.players.some((p) => p.cardId === member.cardId)) return team;
  return { ...team, players: [...team.players, { cardId: member.cardId, name: member.name.trim(), joinedAt: now() }] };
}

export function removeMember(team: Team, by: string, cardId: string): Team {
  requireAdmin(team, by);
  return { ...team, players: team.players.filter((p) => p.cardId !== cardId), captainCardId: team.captainCardId === cardId ? undefined : team.captainCardId };
}

export function setCaptain(team: Team, by: string, cardId: string | undefined): Team {
  requireAdmin(team, by);
  if (cardId && !team.players.some((p) => p.cardId === cardId)) throw new MutationError("The captain must be in the squad.");
  return { ...team, captainCardId: cardId };
}

export function setJersey(team: Team, by: string, cardId: string, jersey: string): Team {
  requireAdmin(team, by);
  return { ...team, players: team.players.map((p) => (p.cardId === cardId ? { ...p, jersey: jersey.trim() || undefined } : p)) };
}

export function setTeamAdmins(team: Team, by: string, admins: string[]): Team {
  if (team.organiser !== by) throw new MutationError("Only the person who created the team can change its admins.");
  return { ...team, scorers: [...new Set(admins)].filter((a) => a && a !== team.organiser) };
}

export function renameTeam(team: Team, by: string, name: string, city: string): Team {
  requireAdmin(team, by);
  if (!name.trim()) throw new MutationError("Give the team a name.");
  return { ...team, name: name.trim(), city: city.trim() };
}

/** A new invite link; the old one stops working. */
export function resetInvite(team: Team, by: string): Team {
  requireAdmin(team, by);
  return { ...team, inviteCode: code() };
}

/** Teams this person runs, or plays in (through one of their cards). */
export function myTeams(teams: Team[], user: string | null, myCardIds: string[]): Team[] {
  return teams.filter((t) => canManageTeam(t, user) || t.players.some((p) => myCardIds.includes(p.cardId)));
}

export function searchTeams(teams: Team[], query: string, sport?: SportKey): Team[] {
  const q = query.trim().toLowerCase();
  return teams
    .filter((t) => (!sport || t.sport === sport) && (!q || t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Parses pasted lines of "Name, mobile" (or tab separated, as copied from a spreadsheet). */
export function parseSquadList(text: string): { rows: { name: string; contact: string }[]; errors: string[] } {
  const rows: { name: string; contact: string }[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\t|,|;/).map((p) => p.trim()).filter(Boolean);
    const contactIndex = parts.findIndex((p) => /^[+\d][\d\s\-()]{6,}$/.test(p) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    if (contactIndex < 0) {
      errors.push(`Line ${i + 1}: add a mobile number after the name ("${line}").`);
      return;
    }
    const name = parts.filter((_, j) => j !== contactIndex).join(" ").trim();
    if (!name) {
      errors.push(`Line ${i + 1}: add the player's name.`);
      return;
    }
    rows.push({ name, contact: parts[contactIndex] });
  });
  return { rows, errors };
}
