import { identityKind } from "../identity";
import { MutationError, newId } from "../rally/mutations";
import { addEntry } from "../tournament/mutations";
import type { Tournament } from "../tournament/types";
import { canManageEvent, formFor } from "./meet";
import type { Meet, Registration } from "./types";

export interface NewRegistrationInput {
  eventId: string;
  captain: string;
  teamName: string;
  players: { name: string; cardId?: string }[];
  contact?: string;
  note?: string;
  formDone: boolean;
}

const PLAYERS: Record<string, [number, number]> = { singles: [1, 1], doubles: [2, 2], team: [1, 40] };

/** A team's request to join an event. `existing` are the requests this person can already see. */
export function createRegistration(meet: Meet, input: NewRegistrationInput, existing: Registration[]): Registration {
  if (!meet.registration.open) throw new MutationError("Registration for this meet is closed.");
  const event = meet.events.find((e) => e.id === input.eventId);
  if (!event) throw new MutationError("Choose a sport / event to register for.");
  if (identityKind(input.captain) === "username") throw new MutationError("Sign in with your mobile number or email to register, so the organiser can reach you.");
  if (formFor(meet, event) && !input.formDone) throw new MutationError("Fill in the organiser's form first, then tick the box.");
  const players = input.players.map((p) => ({ name: p.name.trim(), cardId: p.cardId || undefined })).filter((p) => p.name);
  const [min, max] = PLAYERS[event.format];
  if (players.length < min || players.length > max) {
    throw new MutationError(event.format === "singles" ? "Enter the player's name." : event.format === "doubles" ? "A doubles pair needs two players." : "Add at least one player.");
  }
  const teamName = (input.teamName.trim() || players.map((p) => p.name).join(" / ")).slice(0, 80);
  const clash = existing.find(
    (r) => r.meetId === meet.id && r.eventId === event.id && r.status !== "rejected" && r.teamName.toLowerCase() === teamName.toLowerCase(),
  );
  if (clash) throw new MutationError(`${teamName} has already registered for ${event.name}.`);
  return {
    id: newId(),
    meetId: meet.id,
    eventId: event.id,
    captain: input.captain,
    teamName,
    players,
    contact: input.contact?.trim() || undefined,
    note: input.note?.trim() || undefined,
    formDone: input.formDone,
    status: "pending",
    createdAt: new Date().toISOString(),
    version: 0,
  };
}

function managed(meet: Meet, reg: Registration, by: string) {
  const event = meet.events.find((e) => e.id === reg.eventId);
  if (!event) throw new MutationError("This event no longer exists.");
  if (!canManageEvent(meet, event, by)) throw new MutationError("Only the organiser or this event's admins can decide on registrations.");
  if (reg.status !== "pending") throw new MutationError(`This request was already ${reg.status}.`);
  return event;
}

/** Accepts a team: it becomes an entry of the event's tournament (while that tournament is still being set up). */
export function approveRegistration(meet: Meet, reg: Registration, tournament: Tournament, by: string): { registration: Registration; tournament: Tournament } {
  const event = managed(meet, reg, by);
  if (tournament.id !== event.tournamentId) throw new MutationError("Tournament not found for this event.");
  if (tournament.phase !== "setup") {
    throw new MutationError(`Fixtures for ${event.name} are already generated, so new teams can't join. Edit the fixtures to make room first.`);
  }
  const players = reg.players.map((p) => ({ name: p.name, cardId: p.cardId }));
  const next = addEntry(tournament, by, reg.teamName, players);
  const entry = next.entries[next.entries.length - 1];
  return {
    registration: { ...reg, status: "approved", entryId: entry.id, decidedBy: by, decidedAt: new Date().toISOString(), reason: undefined },
    tournament: next,
  };
}

export function rejectRegistration(meet: Meet, reg: Registration, by: string, reason: string): Registration {
  managed(meet, reg, by);
  return { ...reg, status: "rejected", reason: reason.trim() || undefined, decidedBy: by, decidedAt: new Date().toISOString() };
}

/** Requests waiting for a decision that this person can decide on. */
export function pendingFor(meets: Meet[], regs: Registration[], user: string | null): Registration[] {
  if (!user) return [];
  return regs.filter((r) => {
    if (r.status !== "pending") return false;
    const meet = meets.find((m) => m.id === r.meetId);
    const event = meet?.events.find((e) => e.id === r.eventId);
    return !!meet && !!event && canManageEvent(meet, event, user);
  });
}
