import { matchState } from "../rally/engine";
import { MutationError, addScorer, createMatch, newId } from "../rally/mutations";
import { validateRules } from "../rally/rules";
import type { Match, Player, RallyRules, SideKey } from "../rally/types";
import { matchesPerPlayer, tieSystem } from "./systems";
import type { LineupMode, Tie, TieSlot, TieTeam } from "./types";

export type Matches = Record<string, Match>;

export type SlotStatus = "needs_lineup" | "ready" | "scheduled" | "live" | "won" | "no_result" | "not_needed";

export interface SlotView {
  slot: TieSlot;
  status: SlotStatus;
  match?: Match;
  winner?: SideKey;
}

export interface TieState {
  slots: SlotView[];
  /** Matches won by each team. */
  score: Record<SideKey, number>;
  /** Games (sets) won by each team across all matches. */
  games: Record<SideKey, number>;
  /** Points won by each team across all matches. */
  points: Record<SideKey, number>;
  needed: number;
  winner: SideKey | null;
  /** Decided and nothing more will be played. */
  complete: boolean;
  live: boolean;
}

export function majority(matchCount: number): number {
  return Math.floor(matchCount / 2) + 1;
}

/** Derives the tie's score and each match's status from the matches played so far. */
export function tieState(tie: Tie, matches: Matches): TieState {
  const score = { A: 0, B: 0 };
  const games = { A: 0, B: 0 };
  const points = { A: 0, B: 0 };
  const needed = majority(tie.matchCount);
  let winner: SideKey | null = null;
  let live = false;

  const slots: SlotView[] = tie.slots.map((slot) => {
    const match = slot.matchId ? matches[slot.matchId] : undefined;
    if (!match) return { slot, status: slot.players ? "ready" : "needs_lineup" };
    const state = matchState(match);
    for (const set of state.sets) {
      points.A += set.A;
      points.B += set.B;
    }
    games.A += state.setsWon.A;
    games.B += state.setsWon.B;
    if (match.status === "scheduled") return { slot, status: "scheduled", match };
    if (match.status === "live") {
      live = true;
      return { slot, status: "live", match };
    }
    if (!state.winner) return { slot, status: "no_result", match };
    score[state.winner] += 1;
    return { slot, status: "won", match, winner: state.winner };
  });

  if (score.A >= needed) winner = "A";
  else if (score.B >= needed) winner = "B";

  // Once decided, matches that haven't started are no longer needed (unless the organiser plays them all).
  if (winner && !tie.playAll) {
    for (const view of slots) {
      if (view.status === "needs_lineup" || view.status === "ready" || view.status === "scheduled") view.status = "not_needed";
    }
  }
  const open = slots.some((v) => ["needs_lineup", "ready", "scheduled", "live"].includes(v.status));
  return { slots, score, games, points, needed, winner, complete: !!winner && !open, live };
}

export interface NewTieInput {
  sport: Tie["sport"];
  title: string;
  venue: string;
  rules: RallyRules;
  teams: Record<SideKey, { name: string; players: Omit<Player, "id">[]; entryId?: string }>;
  matchCount: number;
  /** Official team system; sets the number, order and formats of the matches. */
  system?: string;
  /** Letters for lettered systems, as positions in each team's player list. */
  letters?: Partial<Record<SideKey, Record<string, number>>>;
  lineupMode: LineupMode;
  /** Line-ups for "advance" mode, by match index: format and player positions in each team's list. */
  lineups?: { format: "singles" | "doubles"; A: number[]; B: number[] }[];
  organiser: string;
  scorers?: string[];
}

function teamFrom(side: { name: string; players: Omit<Player, "id">[]; entryId?: string }, fallback: string): TieTeam {
  return {
    name: side.name.trim() || fallback,
    players: side.players.filter((p) => p.name.trim()).map((p) => ({ id: newId(), name: p.name.trim(), jersey: p.jersey?.trim() || undefined })),
    entryId: side.entryId,
  };
}

export function createTie(input: NewTieInput): Tie {
  const system = tieSystem(input.system);
  if (input.system && (!system || system.sport !== input.sport)) throw new MutationError("Unknown team system for this sport.");
  if (system) input = { ...input, matchCount: system.slots.length, lineupMode: "at_start", lineups: undefined };
  if (!Number.isInteger(input.matchCount) || input.matchCount < 1 || input.matchCount > 9 || input.matchCount % 2 === 0) {
    throw new MutationError("A tie has an odd number of matches between 1 and 9, so it can't end level.");
  }
  const invalid = validateRules(input.rules);
  if (invalid) throw new MutationError(invalid);
  const teams = { A: teamFrom(input.teams.A, "Team A"), B: teamFrom(input.teams.B, "Team B") };
  if (teams.A.name.toLowerCase() === teams.B.name.toLowerCase()) throw new MutationError("The two teams need different names.");
  for (const side of ["A", "B"] as const) {
    if (teams[side].players.length === 0) throw new MutationError(`Add at least one player to ${teams[side].name}.`);
  }
  let tie: Tie = {
    id: newId(),
    sport: input.sport,
    title: input.title.trim() || `${teams.A.name} vs ${teams.B.name}`,
    venue: input.venue.trim(),
    rules: { ...input.rules },
    teams,
    matchCount: input.matchCount,
    system: system?.key,
    lineupMode: input.lineupMode,
    playAll: false,
    slots: Array.from({ length: input.matchCount }, (_, index) => {
      const def = system?.slots[index];
      return def ? { index, format: def.format, label: def.label, letters: def.letters } : { index };
    }),
    organiser: input.organiser,
    scorers: [...new Set(input.scorers ?? [])].filter((s) => s !== input.organiser),
    createdAt: new Date().toISOString(),
    version: 0,
  };
  for (const side of ["A", "B"] as const) {
    const given = input.letters?.[side];
    if (!given) continue;
    const ids = Object.fromEntries(Object.entries(given).map(([letter, pos]) => [letter, tie.teams[side].players[pos]?.id ?? ""]));
    tie = applyLetters(tie, side, ids);
  }
  if (input.lineupMode === "advance") {
    if (!input.lineups || input.lineups.length !== input.matchCount) throw new MutationError("Set the line-up for every match.");
    input.lineups.forEach((l, i) => {
      const ids = (side: SideKey) => l[side].map((pos) => tie.teams[side].players[pos]?.id).filter(Boolean) as string[];
      tie = applyLineup(tie, i, l.format, { A: ids("A"), B: ids("B") });
    });
  }
  return tie;
}

export function hasTieAccess(tie: Tie, user: string | null): boolean {
  return !!user && (tie.organiser === user || tie.scorers.includes(user));
}

function applyLineup(tie: Tie, index: number, format: "singles" | "doubles", players: Record<SideKey, string[]>): Tie {
  const slot = tie.slots[index];
  if (!slot) throw new MutationError("Match not found.");
  if (slot.matchId) throw new MutationError("This match has already been created; its line-up can't change.");
  if (slot.letters) throw new MutationError(`The players for ${slot.label} come from the team letters.`);
  const system = tieSystem(tie.system);
  if (system && slot.format && slot.format !== format) {
    throw new MutationError(`${slot.label ?? `Match ${index + 1}`} is ${slot.format} in the ${system.label} format.`);
  }
  const size = format === "singles" ? 1 : 2;
  for (const side of ["A", "B"] as const) {
    const team = tie.teams[side];
    const chosen = players[side];
    if (chosen.length !== size || new Set(chosen).size !== size) {
      throw new MutationError(`Pick ${size === 1 ? "one player" : "two different players"} from ${team.name} for match ${index + 1}.`);
    }
    if (!chosen.every((id) => team.players.some((p) => p.id === id))) throw new MutationError(`Unknown player for ${team.name}.`);
  }
  const slots = tie.slots.map((s) => (s.index === index ? { ...s, format, players } : s));
  const next = { ...tie, slots };
  checkMaxPerPlayer(next);
  return next;
}

function checkMaxPerPlayer(tie: Tie) {
  const max = tieSystem(tie.system)?.maxPerPlayer;
  if (!max) return;
  for (const [id, count] of matchesPerPlayer(tie)) {
    if (count <= max) continue;
    const player = [...tie.teams.A.players, ...tie.teams.B.players].find((p) => p.id === id);
    throw new MutationError(`${player?.name ?? "A player"} would play ${count} matches; this format allows ${max}.`);
  }
}

/** Assigns a team's letters (letter → player id) and fills the lettered singles that haven't started. */
function applyLetters(tie: Tie, side: SideKey, map: Record<string, string>): Tie {
  const system = tieSystem(tie.system);
  if (!system?.letters) throw new MutationError("This tie doesn't use letters.");
  const allowed = system.letters[side];
  const team = tie.teams[side];
  const clean: Record<string, string> = {};
  for (const [letter, id] of Object.entries(map)) {
    if (!id) continue;
    if (!allowed.includes(letter)) throw new MutationError(`${team.name} uses the letters ${allowed.join(", ")}.`);
    if (!team.players.some((p) => p.id === id)) throw new MutationError(`Unknown player for ${team.name}.`);
    clean[letter] = id;
  }
  if (new Set(Object.values(clean)).size !== Object.values(clean).length) throw new MutationError("Give each letter a different player.");
  const before = tie.letters?.[side] ?? {};
  for (const slot of tie.slots) {
    const letter = slot.letters?.[side];
    if (slot.matchId && letter && before[letter] !== clean[letter]) {
      throw new MutationError(`${slot.label} has already started, so player ${letter} can't change.`);
    }
  }
  const letters = { ...tie.letters, [side]: clean };
  const slots = tie.slots.map((slot) => {
    if (!slot.letters || slot.matchId) return slot;
    const a = letters.A?.[slot.letters.A];
    const b = letters.B?.[slot.letters.B];
    return { ...slot, players: a && b ? { A: [a], B: [b] } : undefined };
  });
  const next = { ...tie, letters, slots };
  checkMaxPerPlayer(next);
  return next;
}

/** Captain's letters for a lettered system (ITTF): fills every singles match from them. */
export function setLetters(tie: Tie, by: string, side: SideKey, map: Record<string, string>): Tie {
  if (!hasTieAccess(tie, by)) throw new MutationError("You don't have scoring access to this tie.");
  return applyLetters(tie, side, map);
}

/** Sets (or changes) a match's line-up before it starts. Anyone with scoring access can do this. */
export function setLineup(tie: Tie, by: string, index: number, format: "singles" | "doubles", players: Record<SideKey, string[]>, matches: Matches): Tie {
  if (!hasTieAccess(tie, by)) throw new MutationError("You don't have scoring access to this tie.");
  const state = tieState(tie, matches);
  if (state.slots[index]?.status === "not_needed") throw new MutationError("The tie is already decided; this match isn't needed.");
  return applyLineup(tie, index, format, players);
}

export function playerLabel(team: TieTeam, ids: string[]): string {
  return ids
    .map((id) => team.players.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p!.name)
    .join(" / ");
}

/**
 * Creates the match for a tie slot from its line-up, ready for the scorer to start. Players are known from
 * the line-up, so "who scored" is never asked.
 */
export function createSlotMatch(tie: Tie, by: string, index: number, matches: Matches): { tie: Tie; match: Match } {
  if (!hasTieAccess(tie, by)) throw new MutationError("You don't have scoring access to this tie.");
  const view = tieState(tie, matches).slots[index];
  if (!view) throw new MutationError("Match not found.");
  if (view.status === "not_needed") throw new MutationError("The tie is already decided; this match isn't needed.");
  const slot = view.slot;
  if (slot.matchId) throw new MutationError("This match has already been created.");
  if (!slot.players || !slot.format) throw new MutationError("Set the line-up first.");
  const side = (s: SideKey) => ({
    name: playerLabel(tie.teams[s], slot.players![s]),
    players: slot.players![s].map((id) => {
      const p = tie.teams[s].players.find((x) => x.id === id)!;
      return { name: p.name, jersey: p.jersey };
    }),
  });
  const base = createMatch({
    sport: tie.sport,
    title: `${tie.title} · ${slot.label ? `Match ${index + 1}: ${slot.label}` : `Match ${index + 1} (${slot.format === "singles" ? "Singles" : "Doubles"})`}`,
    venue: tie.venue,
    livestreamUrl: "",
    format: slot.format,
    rules: tie.rules,
    sides: { A: side("A"), B: side("B") },
    organiser: tie.organiser,
    scorers: tie.scorers,
  });
  const match: Match = {
    ...base,
    settings: { ...base.settings, askWho: false },
    tie: { id: tie.id, index, teams: { A: tie.teams.A.name, B: tie.teams.B.name } },
  };
  const slots = tie.slots.map((s) => (s.index === index ? { ...s, matchId: match.id } : s));
  return { tie: { ...tie, slots }, match };
}

export function setPlayAll(tie: Tie, by: string, playAll: boolean): Tie {
  if (tie.organiser !== by) throw new MutationError("Only the organiser can change this.");
  return { ...tie, playAll };
}

/** Adds a scorer to the tie and to its matches not yet closed. */
export function addTieScorer(tie: Tie, by: string, user: string, matches: Matches): { tie: Tie; matches: Match[] } {
  if (!hasTieAccess(tie, by)) throw new MutationError("You don't have scoring access to this tie.");
  if (hasTieAccess(tie, user)) throw new MutationError(`${user} already has scoring access.`);
  const updated = tie.slots
    .map((s) => (s.matchId ? matches[s.matchId] : undefined))
    .filter((m): m is Match => !!m && m.status !== "closed" && !m.scorers.some((x) => x.user === user))
    .map((m) => addScorer(m, by, user));
  return { tie: { ...tie, scorers: [...tie.scorers, user] }, matches: updated };
}
