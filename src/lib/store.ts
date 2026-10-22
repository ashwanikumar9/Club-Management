"use client";

import { useSyncExternalStore } from "react";
import { MutationError } from "./rally/mutations";
import type { Match } from "./rally/types";
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
const tournaments = collection<Tournament>("cm.tournaments.v1");

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === matches.key) matches.refresh();
    if (e.key === tournaments.key) tournaments.refresh();
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
 * Tournament matches also bring their tournament up to date (e.g. the winner moves to the next round).
 */
export function updateMatch(id: string, mutate: (match: Match) => Match): string | null {
  const error = matches.update(id, mutate);
  const tournamentId = matches.read()[id]?.tournament?.id;
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

/**
 * Runs a tournament action that may also create or change matches. The action receives the latest
 * stored tournament and matches; returns an error message instead of throwing.
 */
export function runTournamentAction(
  id: string,
  action: (t: Tournament, all: Collection<Match>) => { tournament: Tournament; matches: Match[] },
): string | null {
  const t = tournaments.read()[id];
  if (!t) return "Tournament not found.";
  try {
    const result = action(t, matches.read());
    matches.saveMany(result.matches);
    if (result.tournament !== t) tournaments.saveMany([{ ...result.tournament, version: t.version + 1 }]);
    return null;
  } catch (error) {
    if (error instanceof MutationError) return error.message;
    throw error;
  }
}

/** Creates ready knockout matches, fixes not-yet-started ones after corrections, and updates the phase. */
export function syncTournamentById(id: string) {
  runTournamentAction(id, (t, all) => {
    const { tournament, created, updated } = syncTournament(t, all);
    return { tournament, matches: [...created, ...updated] };
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
