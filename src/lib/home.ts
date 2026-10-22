import { canManageEvent } from "./meet/meet";
import type { Meet, Registration } from "./meet/types";
import { canManageTournament } from "./tournament/access";
import type { Tournament } from "./tournament/types";

/** A tournament or sports meet as listed on the home page. Tournaments inside a meet are shown through the meet. */
export type EventItem = { kind: "meet"; meet: Meet; id: string } | { kind: "tournament"; t: Tournament; id: string };

export type EventStatus = "live" | "upcoming" | "finished";

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function eventStatus(item: EventItem, tournaments: Record<string, Tournament>, on: string = today()): EventStatus {
  if (item.kind === "tournament") {
    if (item.t.phase === "complete") return "finished";
    if (item.t.phase === "setup") return item.t.startDate && item.t.startDate <= on ? "live" : "upcoming";
    return "live";
  }
  const parts = item.meet.events.map((e) => tournaments[e.tournamentId]).filter(Boolean);
  if (parts.length > 0 && parts.every((t) => t.phase === "complete")) return "finished";
  if (item.meet.endDate && item.meet.endDate < on) return "finished";
  if (parts.some((t) => t.phase === "groups" || t.phase === "knockout")) return "live";
  return item.meet.startDate && item.meet.startDate <= on ? "live" : "upcoming";
}

function startOf(item: EventItem) {
  return (item.kind === "meet" ? item.meet.startDate : item.t.startDate) || "9999";
}

function cityOf(item: EventItem) {
  return (item.kind === "meet" ? item.meet.city : item.t.city) ?? "";
}

const ORDER: Record<EventStatus, number> = { live: 0, upcoming: 1, finished: 2 };

function sortItems(items: EventItem[], tournaments: Record<string, Tournament>) {
  return items.sort((a, b) => ORDER[eventStatus(a, tournaments)] - ORDER[eventStatus(b, tournaments)] || startOf(a).localeCompare(startOf(b)));
}

function standalone(tournaments: Record<string, Tournament>): Tournament[] {
  return Object.values(tournaments).filter((t) => !t.meet);
}

/**
 * Events this person is part of: runs or scores, plays in (through their player cards), registered a team for,
 * or opened recently. Live and upcoming first.
 */
export function yourEvents(
  user: string | null,
  meets: Record<string, Meet>,
  tournaments: Record<string, Tournament>,
  registrations: Registration[],
  myCardIds: string[],
  recentIds: string[],
): EventItem[] {
  const plays = (t: Tournament) => t.entries.some((e) => e.players.some((p) => p.cardId && myCardIds.includes(p.cardId)));
  const involvedIn = (t: Tournament) => canManageTournament(t, user) || (!!user && t.scorers.includes(user)) || plays(t);
  const items: EventItem[] = [];
  for (const meet of Object.values(meets)) {
    const parts = meet.events.map((e) => tournaments[e.tournamentId]).filter(Boolean);
    const mine =
      meet.organiser === user ||
      meet.events.some((e) => canManageEvent(meet, e, user)) ||
      parts.some(involvedIn) ||
      registrations.some((r) => r.meetId === meet.id && r.captain === user) ||
      recentIds.includes(meet.id);
    if (mine) items.push({ kind: "meet", meet, id: meet.id });
  }
  for (const t of standalone(tournaments)) {
    if (involvedIn(t) || recentIds.includes(t.id)) items.push({ kind: "tournament", t, id: t.id });
  }
  return sortItems(items, tournaments);
}

/** Live and upcoming events in this city (case-insensitive), soonest first. */
export function nearYou(city: string, meets: Record<string, Meet>, tournaments: Record<string, Tournament>): EventItem[] {
  const want = city.trim().toLowerCase();
  if (!want) return [];
  const items: EventItem[] = [
    ...Object.values(meets).map((meet): EventItem => ({ kind: "meet", meet, id: meet.id })),
    ...standalone(tournaments).map((t): EventItem => ({ kind: "tournament", t, id: t.id })),
  ].filter((i) => cityOf(i).trim().toLowerCase() === want && eventStatus(i, tournaments) !== "finished");
  return sortItems(items, tournaments);
}

/** Cities that events are listed in, for the city picker. */
export function knownCities(meets: Record<string, Meet>, tournaments: Record<string, Tournament>): string[] {
  const seen = new Map<string, string>();
  for (const c of [...Object.values(meets).map((m) => m.city ?? ""), ...Object.values(tournaments).map((t) => t.city ?? "")]) {
    const k = c.trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, c.trim());
  }
  return [...seen.values()].sort();
}
