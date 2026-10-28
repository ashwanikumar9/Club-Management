import { identityKind, parseIdentity } from "../identity";
import { MutationError, newId } from "../rally/mutations";
import type { SportKey } from "../rally/types";

/**
 * A player's card: one profile per person, reused in every match, tie and tournament they play, in any
 * sport. The card itself is public; the mobile number / email that identify the player are kept apart
 * (see ContactRow) and only shown to the person who added them and to the player.
 */
export interface PlayerCard {
  id: string;
  name: string;
  /** Who created the card (an organiser, or the player). They can edit it; so can the player. */
  organiser: string;
  sports: SportKey[];
  club?: string;
  /** Playing hand (older cards; new cards keep it per sport in `profiles`). */
  hand?: "right" | "left";
  /** Year of birth; the card shows the age worked out from it (age groups go by year of birth too). */
  birthYear?: number;
  /** How the player plays each sport, e.g. { badminton: { hand: "Left-handed", style: "Attacking" } }. */
  profiles?: Partial<Record<SportKey, SportProfile>>;
  /** Masked contacts, e.g. "+91 ••••• 43210", so organisers can tell two "Riya"s apart. */
  contactHints: string[];
  /** Left out of search and the player directory (the profile link still works). */
  hidden?: boolean;
  createdAt: string;
  version: number;
}

/** Playing style in one sport: field key (see PROFILE_FIELDS) → chosen option. */
export type SportProfile = Partial<Record<string, string>>;

const HAND = { key: "hand", label: "Playing hand", options: ["Right-handed", "Left-handed"] };

/** What a player can say about how they play, per sport. Their record is never editable: it comes from matches. */
export const PROFILE_FIELDS: Record<SportKey, { key: string; label: string; options: string[] }[]> = {
  badminton: [
    HAND,
    { key: "style", label: "Style", options: ["Attacking", "Defensive", "All-round"] },
    { key: "event", label: "Best at", options: ["Singles", "Doubles", "Mixed doubles"] },
  ],
  table_tennis: [
    HAND,
    { key: "grip", label: "Grip", options: ["Shakehand", "Penhold"] },
    { key: "style", label: "Style", options: ["Attacker", "Defender / chopper", "All-round"] },
  ],
  volleyball: [
    HAND,
    { key: "position", label: "Position", options: ["Setter", "Outside hitter", "Opposite", "Middle blocker", "Libero", "Defensive specialist", "All-rounder"] },
  ],
};

/** Age this year, from the year of birth. */
export function ageOf(card: Pick<PlayerCard, "birthYear">, now = new Date()): number | null {
  return card.birthYear ? now.getFullYear() - card.birthYear : null;
}

/** "Left-handed · Attacking · Doubles" for one sport (falls back to the older card-wide hand). */
export function profileSummary(card: PlayerCard, sport: SportKey): string {
  const p = card.profiles?.[sport] ?? {};
  const values = PROFILE_FIELDS[sport].map((f) => p[f.key]).filter(Boolean) as string[];
  if (!p.hand && card.hand && PROFILE_FIELDS[sport].some((f) => f.key === "hand")) values.unshift(card.hand === "right" ? "Right-handed" : "Left-handed");
  return values.join(" · ");
}

function cleanProfiles(profiles: Partial<Record<SportKey, SportProfile>>): Partial<Record<SportKey, SportProfile>> | undefined {
  const out: Partial<Record<SportKey, SportProfile>> = {};
  for (const [sport, profile] of Object.entries(profiles) as [SportKey, SportProfile][]) {
    const fields = PROFILE_FIELDS[sport];
    if (!fields || !profile) continue;
    const kept: SportProfile = {};
    for (const f of fields) {
      const v = profile[f.key];
      if (v && f.options.includes(v)) kept[f.key] = v;
    }
    if (Object.keys(kept).length) out[sport] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanBirthYear(year: number, now = new Date()): number {
  if (!Number.isInteger(year) || year < now.getFullYear() - 100 || year > now.getFullYear() - 3) {
    throw new MutationError(`Enter a year of birth between ${now.getFullYear() - 100} and ${now.getFullYear() - 3}.`);
  }
  return year;
}

/** Private link between a card and a mobile number or email. Signing in with it makes the card yours. */
export interface ContactRow {
  playerId: string;
  contact: string;
  addedBy: string;
}

export interface NewCardInput {
  name: string;
  /** Mobile numbers and / or emails, already normalised (see parseIdentity). At least one is required. */
  contacts: string[];
  sports?: SportKey[];
  club?: string;
  hand?: "right" | "left";
  by: string;
}

/** "+919876543210" → "+91 ••••• 43210"; "riya.sharma@gmail.com" → "r•••@gmail.com". */
export function maskContact(contact: string): string {
  if (identityKind(contact) === "email") {
    const [local, domain] = contact.split("@");
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  const digits = contact.replace(/^\+/, "");
  const country = digits.length > 10 ? digits.slice(0, digits.length - 10) : "";
  return `+${country}${country ? " " : ""}••••• ${digits.slice(-5)}`;
}

/** Validates contacts: each must be a mobile number or email (usernames can't prove who someone is). */
export function cleanContacts(contacts: string[]): string[] {
  const list = [...new Set(contacts.map((c) => c.trim()).filter(Boolean))];
  if (list.length === 0) throw new MutationError("Add the player's mobile number or email.");
  for (const c of list) {
    const parsed = parseIdentity(c, undefined, false);
    if (!parsed.ok || parsed.key !== c) throw new MutationError(`${c} isn't a mobile number or email.`);
  }
  return list;
}

export function createCard(input: NewCardInput): { card: PlayerCard; contacts: ContactRow[] } {
  const name = input.name.trim();
  if (!name) throw new MutationError("Enter the player's name.");
  const contacts = cleanContacts(input.contacts);
  const card: PlayerCard = {
    id: newId(),
    name,
    organiser: input.by,
    sports: [...new Set(input.sports ?? [])],
    club: input.club?.trim() || undefined,
    hand: input.hand,
    contactHints: contacts.map(maskContact),
    createdAt: new Date().toISOString(),
    version: 0,
  };
  return { card, contacts: contacts.map((contact) => ({ playerId: card.id, contact, addedBy: input.by })) };
}

/** Whether `user` owns the card: they signed in with one of its contacts. */
export function ownsCard(card: PlayerCard, contacts: ContactRow[], user: string | null): boolean {
  return !!user && contacts.some((c) => c.playerId === card.id && c.contact === user);
}

export function canEditCard(card: PlayerCard, contacts: ContactRow[], user: string | null): boolean {
  return !!user && (card.organiser === user || ownsCard(card, contacts, user));
}

export interface CardChanges {
  name?: string;
  sports?: SportKey[];
  club?: string;
  hand?: "right" | "left" | null;
  /** null clears it. */
  birthYear?: number | null;
  profiles?: Partial<Record<SportKey, SportProfile>>;
  hidden?: boolean;
}

export function updateCard(card: PlayerCard, contacts: ContactRow[], by: string, changes: CardChanges): PlayerCard {
  if (!canEditCard(card, contacts, by)) throw new MutationError("Only the player or whoever created this card can change it.");
  const name = changes.name === undefined ? card.name : changes.name.trim();
  if (!name) throw new MutationError("Enter the player's name.");
  return {
    ...card,
    name,
    sports: changes.sports ? [...new Set(changes.sports)] : card.sports,
    club: changes.club === undefined ? card.club : changes.club.trim() || undefined,
    hand: changes.hand === undefined ? card.hand : (changes.hand ?? undefined),
    birthYear: changes.birthYear === undefined ? card.birthYear : changes.birthYear === null ? undefined : cleanBirthYear(changes.birthYear),
    profiles: changes.profiles === undefined ? card.profiles : cleanProfiles(changes.profiles),
    hidden: changes.hidden ?? card.hidden,
  };
}

/** Adds a mobile number or email to a card (e.g. the player's second number). */
export function addContact(card: PlayerCard, contacts: ContactRow[], by: string, contact: string): { card: PlayerCard; row: ContactRow } {
  if (!canEditCard(card, contacts, by)) throw new MutationError("Only the player or whoever created this card can change it.");
  const [clean] = cleanContacts([contact]);
  if (contacts.some((c) => c.playerId === card.id && c.contact === clean)) throw new MutationError("That contact is already on this card.");
  return {
    card: { ...card, contactHints: [...card.contactHints, maskContact(clean)] },
    row: { playerId: card.id, contact: clean, addedBy: by },
  };
}

/** Cards whose name, club or contact hint matches the search (hidden cards only for their owner / creator). */
export function searchCards(cards: PlayerCard[], query: string, user: string | null, contacts: ContactRow[]): PlayerCard[] {
  const q = query.trim().toLowerCase();
  return cards
    .filter((c) => !c.hidden || canEditCard(c, contacts, user))
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.club ?? "").toLowerCase().includes(q) || c.contactHints.some((h) => h.includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Cards that belong to the signed-in person. */
export function myCards(cards: PlayerCard[], contacts: ContactRow[], user: string | null): PlayerCard[] {
  return cards.filter((c) => ownsCard(c, contacts, user));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
