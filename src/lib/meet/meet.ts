import { MutationError, newId } from "../rally/mutations";
import { FORMAT_LABELS, SPORTS } from "../rally/sports";
import type { MatchFormat, SportKey } from "../rally/types";
import { createTournament, usesTies } from "../tournament/mutations";
import { TEMPLATES } from "../tournament/presets";
import type { Tournament } from "../tournament/types";
import type { Meet, MeetEvent } from "./types";

export interface NewEventInput {
  sport: SportKey;
  format: MatchFormat;
  /** Defaults to "Badminton · Singles". */
  name?: string;
  /** Tournament template key (see tournament/presets.ts); defaults to "championship". */
  template?: string;
  admins?: string[];
  formUrl?: string;
}

export interface NewMeetInput {
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate?: string;
  organiser: string;
  events: NewEventInput[];
  registration?: Meet["registration"];
}

const now = () => new Date().toISOString();

export function eventLabel(sport: SportKey, format: MatchFormat): string {
  return `${SPORTS[sport].name} · ${FORMAT_LABELS[format]}`;
}

function cleanUrl(url: string | undefined): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".")) throw new Error();
    return parsed.toString();
  } catch {
    throw new MutationError(`"${value}" isn't a valid link. Paste the form's full address, e.g. https://forms.gle/…`);
  }
}

export function canManageMeet(meet: Pick<Meet, "organiser">, user: string | null): boolean {
  return !!user && meet.organiser === user;
}

/** The organiser, or an admin of this event. */
export function canManageEvent(meet: Pick<Meet, "organiser">, event: Pick<MeetEvent, "admins">, user: string | null): boolean {
  return !!user && (meet.organiser === user || event.admins.includes(user));
}

/** Events this person runs (all of them for the organiser). */
export function managedEvents(meet: Meet, user: string | null): MeetEvent[] {
  return meet.events.filter((e) => canManageEvent(meet, e, user));
}

function requireOrganiser(meet: Meet, by: string) {
  if (!canManageMeet(meet, by)) throw new MutationError("Only the meet's organiser can change this.");
}

/** Builds the tournament an event is played as, from a template, with the event's admins in charge. */
function eventTournament(meet: Pick<Meet, "id" | "name" | "venue" | "city" | "startDate" | "organiser">, event: MeetEvent, template: string | undefined): Tournament {
  const tpl = TEMPLATES.find((x) => x.key === (template ?? "championship") && x.sports.includes(event.sport)) ?? TEMPLATES.find((x) => x.key === "championship")!;
  const s = tpl.settings(event.sport);
  const team = usesTies({ sport: event.sport, format: event.format });
  const t = createTournament({
    name: `${meet.name} · ${event.name}`,
    sport: event.sport,
    format: event.format,
    venue: meet.venue,
    startDate: meet.startDate,
    organiser: meet.organiser,
    rules: s.rules,
    points: s.points,
    ranking: s.ranking,
    legs: s.legs,
    structure: s.structure,
    thirdPlace: s.thirdPlace,
    tieSystem: team ? (s.tieSystem ?? (event.sport === "badminton" ? "thomas_uber" : "swaythling")) : undefined,
  });
  return {
    ...t,
    id: event.tournamentId,
    admins: [...event.admins],
    scorers: [...event.admins], // admins also get scoring access (and database write access) to every match
    city: meet.city || undefined,
    meet: { id: meet.id, name: meet.name, eventId: event.id },
  };
}

function makeEvent(input: NewEventInput, organiser: string, existing: MeetEvent[]): MeetEvent {
  if (!SPORTS[input.sport]) throw new MutationError("Unknown sport.");
  if (!SPORTS[input.sport].formats.includes(input.format)) {
    throw new MutationError(`${SPORTS[input.sport].name} has no ${FORMAT_LABELS[input.format].toLowerCase()} format.`);
  }
  const name = input.name?.trim() || eventLabel(input.sport, input.format);
  if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    throw new MutationError(`There is already an event called "${name}". Give it a different name, e.g. "${name} (Women)".`);
  }
  return {
    id: newId(),
    sport: input.sport,
    format: input.format,
    name,
    tournamentId: newId(),
    admins: [...new Set(input.admins ?? [])].filter((a) => a && a !== organiser),
    formUrl: cleanUrl(input.formUrl),
  };
}

export function createMeet(input: NewMeetInput): { meet: Meet; tournaments: Tournament[] } {
  const name = input.name.trim();
  if (!name) throw new MutationError("Give the sports meet a name.");
  if (input.events.length === 0) throw new MutationError("Add at least one sport.");
  if (input.endDate && input.startDate && input.endDate < input.startDate) throw new MutationError("The end date is before the start date.");
  const events: MeetEvent[] = [];
  for (const e of input.events) events.push(makeEvent(e, input.organiser, events));
  const meet: Meet = {
    id: newId(),
    name,
    venue: input.venue.trim(),
    city: input.city.trim(),
    startDate: input.startDate,
    endDate: input.endDate || input.startDate,
    organiser: input.organiser,
    events,
    registration: {
      open: input.registration?.open ?? true,
      formUrl: cleanUrl(input.registration?.formUrl),
      info: input.registration?.info?.trim() || undefined,
    },
    scorers: [],
    createdAt: now(),
    version: 0,
  };
  const tournaments = events.map((e, i) => eventTournament(meet, e, input.events[i].template));
  return { meet, tournaments };
}

export function addMeetEvent(meet: Meet, by: string, input: NewEventInput): { meet: Meet; tournament: Tournament } {
  requireOrganiser(meet, by);
  const event = makeEvent(input, meet.organiser, meet.events);
  return { meet: { ...meet, events: [...meet.events, event] }, tournament: eventTournament(meet, event, input.template) };
}

/** Removes an event whose tournament hasn't started (no fixtures, no entries). */
export function removeMeetEvent(meet: Meet, by: string, eventId: string, tournament: Tournament | undefined): Meet {
  requireOrganiser(meet, by);
  if (tournament && (tournament.phase !== "setup" || tournament.entries.length > 0)) {
    throw new MutationError("This event already has teams or fixtures, so it can't be removed.");
  }
  return { ...meet, events: meet.events.filter((e) => e.id !== eventId) };
}

/** Sets an event's admins; they also become admins and scorers of its tournament. */
export function setEventAdmins(meet: Meet, by: string, eventId: string, admins: string[], tournament: Tournament): { meet: Meet; tournament: Tournament } {
  requireOrganiser(meet, by);
  const event = meet.events.find((e) => e.id === eventId);
  if (!event) throw new MutationError("Event not found.");
  const clean = [...new Set(admins)].filter((a) => a && a !== meet.organiser);
  const removed = event.admins.filter((a) => !clean.includes(a));
  return {
    meet: { ...meet, events: meet.events.map((e) => (e.id === eventId ? { ...e, admins: clean } : e)) },
    tournament: {
      ...tournament,
      admins: clean,
      scorers: [...new Set([...tournament.scorers.filter((s) => !removed.includes(s)), ...clean])],
    },
  };
}

export function updateMeet(
  meet: Meet,
  by: string,
  changes: Partial<Pick<Meet, "name" | "venue" | "city" | "startDate" | "endDate">> & { registration?: Partial<Meet["registration"]> },
): Meet {
  requireOrganiser(meet, by);
  const name = changes.name === undefined ? meet.name : changes.name.trim();
  if (!name) throw new MutationError("Give the sports meet a name.");
  const registration = changes.registration
    ? {
        open: changes.registration.open ?? meet.registration.open,
        formUrl: "formUrl" in changes.registration ? cleanUrl(changes.registration.formUrl) : meet.registration.formUrl,
        info: "info" in changes.registration ? changes.registration.info?.trim() || undefined : meet.registration.info,
      }
    : meet.registration;
  const next = {
    ...meet,
    name,
    venue: changes.venue?.trim() ?? meet.venue,
    city: changes.city?.trim() ?? meet.city,
    startDate: changes.startDate ?? meet.startDate,
    endDate: changes.endDate ?? meet.endDate,
    registration,
  };
  if (next.endDate && next.startDate && next.endDate < next.startDate) throw new MutationError("The end date is before the start date.");
  return next;
}

export function setEventForm(meet: Meet, by: string, eventId: string, formUrl: string): Meet {
  requireOrganiser(meet, by);
  const url = cleanUrl(formUrl);
  return { ...meet, events: meet.events.map((e) => (e.id === eventId ? { ...e, formUrl: url } : e)) };
}

/** The form a team must fill in for this event (its own, else the meet's), if any. */
export function formFor(meet: Meet, event: MeetEvent): string | undefined {
  return event.formUrl ?? meet.registration.formUrl;
}
