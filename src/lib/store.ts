"use client";

import { useSyncExternalStore } from "react";
import { MutationError } from "./rally/mutations";
import type { Match } from "./rally/types";
import type { Tie } from "./tie/types";
import type { Data } from "./tournament/engine";
import { syncTournament } from "./tournament/mutations";
import type { Tournament } from "./tournament/types";

/**
 * Prototype persistence: matches and tournaments live in localStorage and sync across tabs via the
 * `storage` event, so a scorer tab and a public-view tab update each other live. This is replaced by
 * Supabase later; screens only use the hooks and update functions, so the swap stays local to this file.
 */
const USER_KEY = "cm.user.v1";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

type Collection<T> = Record<string, T>;

function collection<T extends { id: string; version: number }>(key: string) {
  let cache: Collection<T> | null = null;

  const read = (): Collection<T> => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}") as Collection<T>;
    } catch {
      return {};
    }
  };

  const write = (next: Collection<T>) => {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage full or blocked: keep the in-memory copy so scoring continues in this tab.
    }
  };

  return {
    key,
    read,
    refresh: () => {
      cache = read();
    },
    get: () => (cache ??= read()),
    /** Writes several items at once, then notifies listeners. */
    saveMany: (items: T[]) => {
      if (items.length === 0) return;
      const next = { ...read() };
      for (const item of items) next[item.id] = item;
      write(next);
      emit();
    },
    remove: (id: string) => {
      const next = { ...read() };
      delete next[id];
      write(next);
      emit();
    },
    /** Applies a mutation to the latest stored copy (never overwriting changes from other tabs). */
    update: (id: string, mutate: (item: T) => T): string | null => {
      const all = read();
      const current = all[id];
      if (!current) return "Not found.";
      try {
        const next = mutate(current);
        if (next === current) return null; // nothing changed
        write({ ...all, [id]: { ...next, version: current.version + 1 } });
        emit();
        return null;
      } catch (error) {
        if (error instanceof MutationError) return error.message;
        throw error;
      }
    },
  };
}

const matches = collection<Match>("cm.matches.v2");
const tournaments = collection<Tournament>("cm.tournaments.v2");
const ties = collection<Tie>("cm.ties.v1");

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === matches.key) matches.refresh();
    if (e.key === tournaments.key) tournaments.refresh();
    if (e.key === ties.key) ties.refresh();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMatches(): Collection<Match> | null {
  return useSyncExternalStore(subscribe, matches.get, () => null);
}

export function useMatch(id: string): Match | null | undefined {
  const all = useMatches();
  if (all === null) return undefined; // still loading (server render)
  return all[id] ?? null;
}

export const saveMatch = (match: Match) => matches.saveMany([match]);
export const saveMatches = matches.saveMany;
export const deleteMatch = matches.remove;

/**
 * Applies a mutation to the latest stored copy of a match. Returns an error message instead of throwing.
 * Tournament matches (and matches inside a tournament tie) also bring their tournament up to date,
 * e.g. the winner moves to the next round.
 */
export function updateMatch(id: string, mutate: (match: Match) => Match): string | null {
  const error = matches.update(id, mutate);
  const match = matches.read()[id];
  const tournamentId = match?.tournament?.id ?? (match?.tie ? ties.read()[match.tie.id]?.tournament?.id : undefined);
  if (!error && tournamentId) syncTournamentById(tournamentId);
  return error;
}

export function useTournaments(): Collection<Tournament> | null {
  return useSyncExternalStore(subscribe, tournaments.get, () => null);
}

export function useTournament(id: string): Tournament | null | undefined {
  const all = useTournaments();
  if (all === null) return undefined;
  return all[id] ?? null;
}

export const saveTournament = (t: Tournament) => tournaments.saveMany([t]);
export const updateTournament = tournaments.update;

export function useTies(): Collection<Tie> | null {
  return useSyncExternalStore(subscribe, ties.get, () => null);
}

export function useTie(id: string): Tie | null | undefined {
  const all = useTies();
  if (all === null) return undefined;
  return all[id] ?? null;
}

const readData = (): Data => ({ matches: matches.read(), ties: ties.read() });

export interface ActionResult<T> {
  item: T;
  matches?: Match[];
  ties?: Tie[];
}

function save<T extends { version: number }>(
  col: { saveMany: (items: T[]) => void },
  current: T,
  result: ActionResult<T>,
) {
  matches.saveMany(result.matches ?? []);
  ties.saveMany((result.ties ?? []) as Tie[]);
  if (result.item !== current) col.saveMany([{ ...result.item, version: current.version + 1 }]);
}

function attempt(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof MutationError) return error.message;
    throw error;
  }
}

/**
 * Runs a tournament action that may also create or change matches and ties. The action receives the
 * latest stored data; returns an error message instead of throwing.
 */
export function runTournamentAction(id: string, action: (t: Tournament, data: Data) => ActionResult<Tournament>): string | null {
  const t = tournaments.read()[id];
  if (!t) return "Tournament not found.";
  return attempt(() => save(tournaments, t, action(t, readData())));
}

/** Runs a tie action that may also create or change matches. */
export function runTieAction(id: string, action: (t: Tie, data: Data) => ActionResult<Tie>): string | null {
  const tie = ties.read()[id];
  if (!tie) return "Tie not found.";
  const error = attempt(() => save(ties, tie, action(tie, readData())));
  if (!error && tie.tournament) syncTournamentById(tie.tournament.id);
  return error;
}

export const saveTie = (tie: Tie) => ties.saveMany([tie]);

/** Creates ready knockout matches / ties, fixes not-yet-started ones after corrections, and updates the phase. */
export function syncTournamentById(id: string) {
  runTournamentAction(id, (t, data) => {
    const r = syncTournament(t, data);
    return { item: r.tournament, matches: [...r.created, ...r.updated], ties: [...r.ties, ...r.updatedTies] };
  });
}

/**
 * Sign-in is kept per browser tab (sessionStorage) so two tabs can act as two different people, which is
 * how the scorer hand-over can be tried on one device. New tabs start as the last person signed in.
 */
let userCache: string | null | undefined;

function readUser(): string | null {
  try {
    return sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

/**
 * The signed-in person's identity key (mobile number, email or @username), or null when signed out.
 * Prototype only: there is no verification yet. Supabase Auth (OTP by SMS / email) replaces this.
 */
export function useUser(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (userCache === undefined ? (userCache = readUser()) : userCache),
    () => null,
  );
}

export function setUser(user: string | null) {
  userCache = user;
  try {
    for (const storage of [sessionStorage, localStorage]) {
      if (user) storage.setItem(USER_KEY, user);
      else storage.removeItem(USER_KEY);
    }
  } catch {
    // ignore
  }
  emit();
}
