"use client";

import { useSyncExternalStore } from "react";
import { MutationError } from "./rally/mutations";
import type { Match } from "./rally/types";

/**
 * Prototype persistence: matches live in localStorage and sync across tabs via the `storage` event,
 * so a scorer tab and a public-view tab update each other live. This is replaced by Supabase later;
 * screens only use the hooks and `updateMatch`, so the swap stays local to this file.
 */
const MATCHES_KEY = "cm.matches.v2";
const USER_KEY = "cm.user.v1";

type Matches = Record<string, Match>;

let matchesCache: Matches | null = null;
let userCache: string | null | undefined;
const listeners = new Set<() => void>();

function readMatches(): Matches {
  try {
    return JSON.parse(localStorage.getItem(MATCHES_KEY) ?? "{}") as Matches;
  } catch {
    return {};
  }
}

function readUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === MATCHES_KEY) matchesCache = readMatches();
    if (e.key === USER_KEY) userCache = readUser();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getMatches(): Matches {
  matchesCache ??= readMatches();
  return matchesCache;
}

function writeMatches(next: Matches) {
  matchesCache = next;
  try {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: keep the in-memory copy so scoring continues in this tab.
  }
  emit();
}

export function useMatches(): Matches | null {
  return useSyncExternalStore(subscribe, getMatches, () => null);
}

export function useMatch(id: string): Match | null | undefined {
  const matches = useMatches();
  if (matches === null) return undefined; // still loading (server render)
  return matches[id] ?? null;
}

export function saveMatch(match: Match) {
  writeMatches({ ...readMatches(), [match.id]: match });
}

export function deleteMatch(id: string) {
  const next = { ...readMatches() };
  delete next[id];
  writeMatches(next);
}

/**
 * Applies a mutation to the latest stored copy of a match (re-read from storage so changes made in
 * other tabs are never overwritten). Returns an error message instead of throwing.
 */
export function updateMatch(id: string, mutate: (match: Match) => Match): string | null {
  const all = readMatches();
  const current = all[id];
  if (!current) return "Match not found.";
  try {
    const next = mutate(current);
    writeMatches({ ...all, [id]: { ...next, version: current.version + 1 } });
    return null;
  } catch (error) {
    if (error instanceof MutationError) return error.message;
    throw error;
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
    if (user) localStorage.setItem(USER_KEY, user);
    else localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
  emit();
}
