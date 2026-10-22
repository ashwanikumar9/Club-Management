"use client";

import { useSyncExternalStore } from "react";
import { MutationError } from "./rally/mutations";
import type { Match } from "./rally/types";
import {
  deleteRow,
  fetchRow,
  identityOf,
  insertContacts,
  insertRows,
  insertRegistration,
  loadContacts,
  loadRegistrations,
  subscribeRegistrations,
  updateRegistration,
  deleteRegistration as deleteRegistrationRow,
  loadCollection,
  remoteEnabled,
  subscribe as subscribeRemote,
  supabase,
  updateRow,
  type CollectionName,
  type Row,
} from "./remote";
import type { Meet, Registration } from "./meet/types";
import type { ContactRow, PlayerCard } from "./players/cards";
import type { Tie } from "./tie/types";
import type { Data } from "./tournament/engine";
import { syncTournament } from "./tournament/mutations";
import type { Tournament } from "./tournament/types";

/**
 * Storage for matches, tournaments and ties.
 *
 * - With Supabase configured, data is shared live between devices. Changes are applied to the local copy at
 *   once (so scoring never waits for the network) and then written with a version check; if someone else
 *   changed the record first, the change is re-applied to their version, which works because every change
 *   is a pure function of the record.
 * - Without it (prototype mode), data lives in this browser and syncs between its tabs.
 *
 * Screens only use the hooks and update functions below, so they don't know which mode is active.
 */
export const isRemote = remoteEnabled;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Problems found after a change was shown locally (network, permissions, conflicts). */
const syncErrorListeners = new Set<(message: string) => void>();

function reportSyncError(message: string) {
  for (const listener of syncErrorListeners) listener(message);
}

export function onSyncError(listener: (message: string) => void) {
  syncErrorListeners.add(listener);
  return () => {
    syncErrorListeners.delete(listener);
  };
}

type Collection<T> = Record<string, T>;
type Versioned = { id: string; version: number };

function collection<T extends Versioned>(name: CollectionName, localKey: string) {
  let cache: Collection<T> | null = null;
  let loading: Promise<void> | null = null;

  const readLocal = (): Collection<T> => {
    try {
      return JSON.parse(localStorage.getItem(localKey) ?? "{}") as Collection<T>;
    } catch {
      return {};
    }
  };

  const setCache = (next: Collection<T>) => {
    cache = next;
    if (!remoteEnabled) {
      try {
        localStorage.setItem(localKey, JSON.stringify(next));
      } catch {
        // Storage full or blocked: keep the in-memory copy so scoring continues in this tab.
      }
    }
    emit();
  };

  const setOne = (item: T) => setCache({ ...read(), [item.id]: item });

  /** Latest copy: from storage in prototype mode (other tabs may have written), else the live cache. */
  function read(): Collection<T> {
    if (!remoteEnabled) return readLocal();
    return cache ?? {};
  }

  /** Loads the collection from the database once; resolves when it is available. */
  function load(): Promise<void> {
    if (!remoteEnabled || cache) return Promise.resolve();
    loading ??= loadCollection<T>(name)
      .then((rows) => setCache(Object.fromEntries(rows.map((r) => [r.id, { ...r.data, version: r.version }]))))
      .catch((e: Error) => {
        loading = null;
        reportSyncError(`Couldn't load data: ${e.message}`);
      });
    return loading;
  }

  /** Applies a change pushed from another device. */
  function receive(event: "upsert" | "delete", row: Row<unknown>) {
    if (row.collection !== name || !cache) return;
    if (event === "delete") {
      const next = { ...cache };
      delete next[row.id];
      setCache(next);
      return;
    }
    const mine = cache[row.id];
    if (!mine || row.version >= mine.version) setOne({ ...(row.data as T), version: row.version });
  }

  async function push(id: string, expected: number, item: T, mutate: (item: T) => T, after?: () => void, attempt = 0): Promise<void> {
    try {
      if (await updateRow(name, id, expected, item, item.version)) {
        after?.();
        return;
      }
      const latest = await fetchRow<T>(name, id);
      if (!latest) {
        reportSyncError("This record no longer exists.");
        return;
      }
      const server = { ...latest.data, version: latest.version };
      if (latest.version === expected || attempt >= 4) {
        setOne(server);
        reportSyncError("Your change wasn't saved: you don't have permission to change this.");
        return;
      }
      // Someone else saved first: apply the same change to their version.
      let next: T;
      try {
        next = mutate(server);
      } catch (e) {
        setOne(server);
        reportSyncError(e instanceof Error ? e.message : String(e));
        return;
      }
      if (next === server) {
        setOne(server);
        after?.();
        return;
      }
      const rebased = { ...next, version: latest.version + 1 };
      setOne(rebased);
      await push(id, latest.version, rebased, mutate, after, attempt + 1);
    } catch (e) {
      reportSyncError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}. Check your connection.`);
    }
  }

  return {
    name,
    localKey,
    read,
    load,
    receive,
    refreshLocal: () => {
      if (!remoteEnabled) cache = readLocal();
    },
    get: (): Collection<T> | null => {
      if (!remoteEnabled) return (cache ??= readLocal());
      void load();
      return cache;
    },
    /** Creates or replaces records. Resolves once they are stored in the database (at once in prototype mode). */
    saveMany: async (items: T[]): Promise<void> => {
      if (items.length === 0) return;
      const current = read();
      const stamped = items.map((i) => (current[i.id] ? { ...i, version: Math.max(i.version, current[i.id].version) + 1 } : i));
      const next = { ...current };
      for (const item of stamped) next[item.id] = item;
      setCache(next);
      if (remoteEnabled) {
        await insertRows(name, stamped.map((i) => ({ id: i.id, version: i.version, data: i }))).catch((e: Error) =>
          reportSyncError(`Couldn't save: ${e.message}`),
        );
      }
    },
    remove: (id: string) => {
      const next = { ...read() };
      delete next[id];
      setCache(next);
      if (remoteEnabled) deleteRow(name, id).catch((e: Error) => reportSyncError(`Couldn't delete: ${e.message}`));
    },
    /**
     * Applies a change to the latest copy. Rule violations come back at once as an error message; `after`
     * runs once the change is saved (immediately in prototype mode).
     */
    update: (id: string, mutate: (item: T) => T, after?: () => void): string | null => {
      const current = read()[id];
      if (!current) return "Not found.";
      let next: T;
      try {
        next = mutate(current);
      } catch (error) {
        if (error instanceof MutationError) return error.message;
        throw error;
      }
      if (next === current) {
        after?.();
        return null;
      }
      const saved = { ...next, version: current.version + 1 };
      setOne(saved);
      if (remoteEnabled) void push(id, current.version, saved, mutate, after);
      else after?.();
      return null;
    },
  };
}

const matches = collection<Match>("matches", "cm.matches.v2");
const tournaments = collection<Tournament>("tournaments", "cm.tournaments.v2");
const ties = collection<Tie>("ties", "cm.ties.v1");
const players = collection<PlayerCard>("players", "cm.players.v1");
const meets = collection<Meet>("meets", "cm.meets.v1");
const all = [matches, tournaments, ties, players, meets];

let remoteStarted = false;

/** Live updates from other devices, and the signed-in user, once per page. */
function startRemote() {
  if (!remoteEnabled || remoteStarted) return;
  remoteStarted = true;
  // Load everything up front: closing a match also updates its tournament, even on pages that don't show it.
  for (const c of all) void c.load();
  void contacts.reload();
  void registrations.reload();
  subscribeRemote((event, row) => {
    for (const c of all) c.receive(event, row);
  });
  const auth = supabase().auth;
  auth.getSession().then(({ data }) => setUserCache(identityOf(data.session?.user)));
  auth.onAuthStateChange((_event, session) => setUserCache(identityOf(session?.user)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startRemote();
  const onStorage = (e: StorageEvent) => {
    for (const c of all) if (e.key === c.localKey) c.refreshLocal();
    if (e.key === CONTACTS_KEY) contacts.refreshLocal();
    if (e.key === REGISTRATIONS_KEY) registrations.refreshLocal();
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
  const list = useMatches();
  if (list === null) return undefined; // still loading
  return list[id] ?? null;
}

export const saveMatch = (match: Match) => void matches.saveMany([match]);
export const saveMatches = (list: Match[]) => void matches.saveMany(list);
export const deleteMatch = matches.remove;

/**
 * Applies a mutation to the latest copy of a match. Returns an error message instead of throwing.
 * Tournament matches (and matches inside a tournament tie) also bring their tournament up to date,
 * e.g. the winner moves to the next round.
 */
export function updateMatch(id: string, mutate: (match: Match) => Match): string | null {
  const before = matches.read()[id];
  const tournamentId = before?.tournament?.id ?? (before?.tie ? ties.read()[before.tie.id]?.tournament?.id : undefined);
  return matches.update(id, mutate, tournamentId ? () => syncTournamentById(tournamentId) : undefined);
}

export function useTournaments(): Collection<Tournament> | null {
  return useSyncExternalStore(subscribe, tournaments.get, () => null);
}

export function useTournament(id: string): Tournament | null | undefined {
  const list = useTournaments();
  if (list === null) return undefined;
  return list[id] ?? null;
}

export const saveTournament = (t: Tournament) => void tournaments.saveMany([t]);
export const updateTournament = (id: string, mutate: (t: Tournament) => Tournament) => tournaments.update(id, mutate);

export function useTies(): Collection<Tie> | null {
  return useSyncExternalStore(subscribe, ties.get, () => null);
}

export function useTie(id: string): Tie | null | undefined {
  const list = useTies();
  if (list === null) return undefined;
  return list[id] ?? null;
}

const readData = (): Data => ({ matches: matches.read(), ties: ties.read() });

export interface ActionResult<T> {
  item: T;
  matches?: Match[];
  ties?: Tie[];
  /** Matches / ties that no longer belong anywhere (e.g. a deleted fixture). */
  deleteMatches?: string[];
  deleteTies?: string[];
}

/**
 * Runs an action that changes a tournament or tie and may create or change matches and ties. The action
 * receives the latest data; new matches and ties are saved once the main change is saved, so a re-applied
 * change after a conflict never leaves duplicates behind.
 */
function runAction<T extends Versioned>(
  col: ReturnType<typeof collection<T>>,
  id: string,
  action: (item: T, data: Data) => ActionResult<T>,
  afterSaved?: () => void,
): string | null {
  let result: ActionResult<T> | null = null;
  return col.update(
    id,
    (item) => {
      result = action(item, readData());
      return result.item;
    },
    () => {
      if (!result) return;
      matches.saveMany(result.matches ?? []);
      ties.saveMany(result.ties ?? []);
      for (const id of result.deleteMatches ?? []) matches.remove(id);
      for (const id of result.deleteTies ?? []) ties.remove(id);
      afterSaved?.();
    },
  );
}

/** Runs a tournament action; returns an error message instead of throwing. */
export function runTournamentAction(id: string, action: (t: Tournament, data: Data) => ActionResult<Tournament>): string | null {
  if (!tournaments.read()[id]) return "Tournament not found.";
  return runAction(tournaments, id, action);
}

/** Runs a tie action that may also create or change matches. */
export function runTieAction(id: string, action: (t: Tie, data: Data) => ActionResult<Tie>): string | null {
  const tie = ties.read()[id];
  if (!tie) return "Tie not found.";
  return runAction(ties, id, action, tie.tournament ? () => syncTournamentById(tie.tournament!.id) : undefined);
}

export const saveTie = (tie: Tie) => void ties.saveMany([tie]);

// ---------------------------------------------------------------------------------------------------------
// Player cards and their private contacts

const CONTACTS_KEY = "cm.playerContacts.v1";

/**
 * Contacts linking cards to mobile numbers / emails. With the database, only rows this person added or that
 * are theirs can be read (reloaded when someone signs in); in prototype mode they live in this browser.
 */
const contacts = (() => {
  let cache: ContactRow[] | null = null;
  let latestLoad = 0;
  const readLocal = (): ContactRow[] => {
    try {
      return JSON.parse(localStorage.getItem(CONTACTS_KEY) ?? "[]") as ContactRow[];
    } catch {
      return [];
    }
  };
  const set = (rows: ContactRow[]) => {
    cache = rows;
    if (!remoteEnabled) {
      try {
        localStorage.setItem(CONTACTS_KEY, JSON.stringify(rows));
      } catch {
        // keep the in-memory copy
      }
    }
    emit();
  };
  return {
    get: (): ContactRow[] => (cache ??= remoteEnabled ? [] : readLocal()),
    refreshLocal: () => {
      if (!remoteEnabled) cache = readLocal();
    },
    reload: async () => {
      if (!remoteEnabled) return;
      // Sign-in can finish while an earlier (signed-out) load is still running: only the latest load counts.
      const request = ++latestLoad;
      try {
        const rows = await loadContacts();
        if (request === latestLoad) set(rows);
      } catch (e) {
        reportSyncError(`Couldn't load player contacts: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    add: async (rows: ContactRow[]) => {
      const current = remoteEnabled ? (cache ?? []) : readLocal();
      set([...current, ...rows]);
      if (remoteEnabled) {
        await insertContacts(rows).catch((e: Error) => reportSyncError(`Couldn't save the contact: ${e.message}`));
      }
    },
  };
})();

export function usePlayers(): Collection<PlayerCard> | null {
  return useSyncExternalStore(subscribe, players.get, () => null);
}

export function usePlayer(id: string): PlayerCard | null | undefined {
  const list = usePlayers();
  if (list === null) return undefined;
  return list[id] ?? null;
}

const NO_CONTACTS: ContactRow[] = [];

/** Contacts visible to this person (see `contacts`). */
export function usePlayerContacts(): ContactRow[] {
  return useSyncExternalStore(subscribe, contacts.get, () => NO_CONTACTS);
}

/** Saves a new card, then its contacts (the database only accepts contacts for a card that exists). */
export function savePlayerCard(card: PlayerCard, rows: ContactRow[]) {
  void players.saveMany([card]).then(() => contacts.add(rows));
}

export const updatePlayerCard = (id: string, mutate: (card: PlayerCard) => PlayerCard) => players.update(id, mutate);

export function addPlayerContact(row: ContactRow, card: PlayerCard): string | null {
  const err = players.update(card.id, () => card);
  if (!err) void contacts.add([row]);
  return err;
}

/** Creates ready knockout matches / ties, fixes not-yet-started ones after corrections, and updates the phase. */
export function syncTournamentById(id: string) {
  void Promise.all(all.map((c) => c.load())).then(() =>
    runTournamentAction(id, (t, data) => {
      const r = syncTournament(t, data);
      return { item: r.tournament, matches: [...r.created, ...r.updated], ties: [...r.ties, ...r.updatedTies] };
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------
// Signed-in person

/**
 * With Supabase, the person signed in with a one-time code (email or SMS). In prototype mode, sign-in is
 * kept per browser tab (sessionStorage) so two tabs can act as two different people; new tabs start as the
 * last person signed in.
 */
const USER_KEY = "cm.user.v1";
let userCache: string | null | undefined;
let registrationChannel: ReturnType<typeof subscribeRegistrations> | null = null;

function setUserCache(user: string | null) {
  const changed = userCache !== user;
  userCache = user;
  emit();
  if (changed && remoteEnabled) {
    // Which contacts and registrations are visible depends on who is signed in. Live updates for
    // registrations are filtered by the same rules, using the identity the subscription started with,
    // so it is restarted for the new person.
    void contacts.reload();
    void registrations.reload();
    if (registrationChannel) void supabase().removeChannel(registrationChannel);
    registrationChannel = user ? subscribeRegistrations(() => void registrations.reload()) : null;
  }
}

function readUser(): string | null {
  if (remoteEnabled) return null; // filled in by the auth listener
  try {
    return sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

/** The signed-in person's identity key (mobile number, email or @username), or null when signed out. */
export function useUser(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => (userCache === undefined ? (userCache = readUser()) : userCache),
    () => null,
  );
}

/** Prototype mode only: sign in as anyone (no verification). */
export function setUser(user: string | null) {
  if (remoteEnabled) {
    if (!user) void supabase().auth.signOut();
    return;
  }
  try {
    for (const storage of [sessionStorage, localStorage]) {
      if (user) storage.setItem(USER_KEY, user);
      else storage.removeItem(USER_KEY);
    }
  } catch {
    // ignore
  }
  setUserCache(user);
}

/** Sends a one-time sign-in code to an email address or mobile number (identity key form). */
export async function sendSignInCode(identity: string): Promise<string | null> {
  const auth = supabase().auth;
  const { error } = identity.includes("@")
    ? await auth.signInWithOtp({ email: identity, options: { shouldCreateUser: true } })
    : await auth.signInWithOtp({ phone: identity, options: { shouldCreateUser: true } });
  if (!error) return null;
  if (error.status === 429) return "Too many codes requested. Wait a minute and try again.";
  if (error.status === 504 || error.status === 500) {
    // The database's auth service couldn't hand the message to the email / SMS sender (SMTP settings).
    return `The code couldn't be sent: the ${identity.includes("@") ? "email" : "SMS"} sender didn't accept it (error ${error.status}). Please try again later or tell the organiser.`;
  }
  return error.message;
}

export async function verifySignInCode(identity: string, code: string): Promise<string | null> {
  const auth = supabase().auth;
  const { error } = identity.includes("@")
    ? await auth.verifyOtp({ email: identity, token: code.trim(), type: "email" })
    : await auth.verifyOtp({ phone: identity, token: code.trim(), type: "sms" });
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------------------------------------
// Sports meets and team registrations

export function useMeets(): Collection<Meet> | null {
  return useSyncExternalStore(subscribe, meets.get, () => null);
}

export function useMeet(id: string): Meet | null | undefined {
  const list = useMeets();
  if (list === null) return undefined;
  return list[id] ?? null;
}

/** Saves a new meet and the tournament of each event (tournaments first, so the meet never points at nothing). */
export function saveMeet(meet: Meet, eventTournaments: Tournament[]) {
  void tournaments.saveMany(eventTournaments).then(() => meets.saveMany([meet]));
}

export const updateMeet = (id: string, mutate: (m: Meet) => Meet) => meets.update(id, mutate);

/** Changes a meet together with one event's tournament (e.g. its admins), or adds / removes an event. */
export function runMeetAction(
  id: string,
  action: (m: Meet, all: Collection<Tournament>) => { meet: Meet; tournament?: Tournament; newTournament?: Tournament; deleteTournament?: string },
): string | null {
  let result: ReturnType<typeof action> | null = null;
  return meets.update(
    id,
    (m) => {
      result = action(m, tournaments.read());
      return result.meet;
    },
    () => {
      if (!result) return;
      if (result.newTournament) void tournaments.saveMany([result.newTournament]);
      if (result.tournament) tournaments.update(result.tournament.id, () => result!.tournament!);
      if (result.deleteTournament) tournaments.remove(result.deleteTournament);
    },
  );
}

const REGISTRATIONS_KEY = "cm.registrations.v1";

/**
 * Registrations visible to this person. With the database, the rules decide which (their own requests, and
 * the requests of events they manage), reloaded on sign-in and on every change; in prototype mode all of them.
 */
const registrations = (() => {
  let cache: Registration[] | null = null;
  let latestLoad = 0;
  const readLocal = (): Registration[] => {
    try {
      return JSON.parse(localStorage.getItem(REGISTRATIONS_KEY) ?? "[]") as Registration[];
    } catch {
      return [];
    }
  };
  const set = (rows: Registration[]) => {
    cache = rows;
    if (!remoteEnabled) {
      try {
        localStorage.setItem(REGISTRATIONS_KEY, JSON.stringify(rows));
      } catch {
        // keep the in-memory copy
      }
    }
    emit();
  };
  const current = () => (remoteEnabled ? (cache ?? []) : readLocal());
  return {
    get: (): Registration[] => (cache ??= remoteEnabled ? [] : readLocal()),
    current,
    refreshLocal: () => {
      if (!remoteEnabled) cache = readLocal();
    },
    reload: async () => {
      if (!remoteEnabled) return;
      const request = ++latestLoad;
      try {
        const rows = await loadRegistrations<Registration>();
        if (request === latestLoad) set(rows);
      } catch (e) {
        reportSyncError(`Couldn't load registrations: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    add: async (reg: Registration): Promise<string | null> => {
      if (remoteEnabled) {
        try {
          await insertRegistration(reg);
        } catch (e) {
          return `Couldn't send the request: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      set([...current(), reg]);
      return null;
    },
    /** Saves a decision; refuses if someone else decided first. */
    replace: async (reg: Registration, expected: number): Promise<string | null> => {
      if (remoteEnabled) {
        try {
          if (!(await updateRegistration(reg, expected))) {
            void registrations.reload();
            return "Someone else updated this request first. It has been refreshed.";
          }
        } catch (e) {
          return `Couldn't save: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      set(current().map((r) => (r.id === reg.id ? { ...reg, version: expected + 1 } : r)));
      return null;
    },
    remove: async (id: string): Promise<string | null> => {
      if (remoteEnabled) {
        try {
          await deleteRegistrationRow(id);
        } catch (e) {
          return `Couldn't withdraw: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      set(current().filter((r) => r.id !== id));
      return null;
    },
  };
})();

const NO_REGISTRATIONS: Registration[] = [];

export function useRegistrations(): Registration[] {
  return useSyncExternalStore(subscribe, registrations.get, () => NO_REGISTRATIONS);
}

export const sendRegistration = (reg: Registration) => registrations.add(reg);
export const withdrawRegistration = (id: string) => registrations.remove(id);

/**
 * Applies a decision on a registration. For an approval, `tournament` adds the team to the event's
 * tournament first; the request is marked approved once that is saved.
 */
export async function decideRegistration(
  reg: Registration,
  decide: (r: Registration, t: Tournament | undefined) => { registration: Registration; tournament?: Tournament },
  tournamentId?: string,
): Promise<string | null> {
  let result: ReturnType<typeof decide> | null = null;
  try {
    result = decide(reg, tournamentId ? tournaments.read()[tournamentId] : undefined);
  } catch (e) {
    if (e instanceof MutationError) return e.message;
    throw e;
  }
  if (result.tournament && tournamentId) {
    const err = tournaments.update(tournamentId, (t) => decide(reg, t).tournament!);
    if (err) return err;
  }
  return registrations.replace(result.registration, reg.version);
}
