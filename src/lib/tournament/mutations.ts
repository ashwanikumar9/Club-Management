import { MutationError, addScorer, createMatch, newId } from "../rally/mutations";
import { validateRules } from "../rally/rules";
import { SPORTS } from "../rally/sports";
import type { Match, MatchFormat, RallyRules, SportKey } from "../rally/types";
import {
  buildKnockout,
  champion,
  groupStageComplete,
  isByeFixture,
  qualifiers,
  resolveSides,
  roundName,
  roundRobin,
  seedOrder,
  snakeAssign,
  type Matches,
} from "./engine";
import type { Entry, EntryPlayer, Fixture, PointsConfig, Structure, Tournament } from "./types";

const now = () => new Date().toISOString();
const GROUP_LETTERS = "ABCDEFGHIJKLMNOP";

export interface NewTournamentInput {
  name: string;
  sport: SportKey;
  format: MatchFormat;
  venue: string;
  startDate: string;
  organiser: string;
  rules: RallyRules;
  points: PointsConfig;
  structure: Structure;
}

export function createTournament(input: NewTournamentInput): Tournament {
  if (!input.name.trim()) throw new MutationError("Give the tournament a name.");
  const invalid = validateRules(input.rules);
  if (invalid) throw new MutationError(invalid);
  return {
    id: newId(),
    name: input.name.trim(),
    sport: input.sport,
    format: input.format,
    venue: input.venue.trim(),
    startDate: input.startDate,
    organiser: input.organiser,
    scorers: [],
    rules: { ...input.rules },
    points: { ...input.points },
    structure: input.structure,
    qualifiersPerGroup: 2,
    entries: [],
    groups: input.structure === "groups_knockout" ? makeGroups(2) : [],
    fixtures: [],
    phase: "setup",
    createdAt: now(),
    version: 0,
  };
}

function makeGroups(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: newId(), name: `Group ${GROUP_LETTERS[i]}`, entryIds: [] as string[] }));
}

function requireOrganiser(t: Tournament, by: string) {
  if (t.organiser !== by) throw new MutationError("Only the organiser can change the tournament.");
}

function requireSetup(t: Tournament) {
  if (t.phase !== "setup") throw new MutationError("Fixtures have been generated; entries and groups are locked.");
}

export function addEntry(t: Tournament, by: string, name: string, players: EntryPlayer[]): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  const clean = players.map((p) => ({ name: p.name.trim(), jersey: p.jersey?.trim() || undefined })).filter((p) => p.name);
  const entryName = name.trim() || clean.map((p) => p.name).join(" / ");
  if (!entryName) throw new MutationError("Enter a name.");
  if (t.entries.some((e) => e.name.toLowerCase() === entryName.toLowerCase())) {
    throw new MutationError(`${entryName} is already in the tournament.`);
  }
  if (t.format === "doubles" && clean.length !== 2) throw new MutationError("A doubles pair needs two players.");
  return { ...t, entries: [...t.entries, { id: newId(), name: entryName, players: clean }] };
}

export function removeEntry(t: Tournament, by: string, entryId: string): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  return {
    ...t,
    entries: t.entries.filter((e) => e.id !== entryId),
    groups: t.groups.map((g) => ({ ...g, entryIds: g.entryIds.filter((id) => id !== entryId) })),
  };
}

/** Sets or clears a seed. Seeds must be unique; giving a used seed moves the other entry off it. */
export function setSeed(t: Tournament, by: string, entryId: string, seed: number | null): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  if (seed !== null && (!Number.isInteger(seed) || seed < 1 || seed > t.entries.length)) {
    throw new MutationError(`Seeds go from 1 to ${t.entries.length}.`);
  }
  const entries = t.entries.map((e) => {
    if (e.id === entryId) return { ...e, seed: seed ?? undefined };
    if (seed !== null && e.seed === seed) return { ...e, seed: undefined };
    return e;
  });
  return { ...t, entries };
}

export function setStructure(t: Tournament, by: string, structure: Structure): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  return { ...t, structure, groups: structure === "groups_knockout" ? (t.groups.length ? t.groups : makeGroups(2)) : [] };
}

export function setGroupCount(t: Tournament, by: string, count: number): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  if (!Number.isInteger(count) || count < 1 || count > GROUP_LETTERS.length) throw new MutationError("Choose between 1 and 16 groups.");
  const groups = makeGroups(count).map((g, i) => (t.groups[i] ? { ...t.groups[i] } : g));
  // Entries from removed groups become unassigned.
  return { ...t, groups };
}

export function setQualifiers(t: Tournament, by: string, perGroup: number): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  if (!Number.isInteger(perGroup) || perGroup < 1) throw new MutationError("At least one team must qualify from each group.");
  return { ...t, qualifiersPerGroup: perGroup };
}

export function assignToGroup(t: Tournament, by: string, entryId: string, groupId: string | null): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  return {
    ...t,
    groups: t.groups.map((g) => {
      const without = g.entryIds.filter((id) => id !== entryId);
      return { ...g, entryIds: g.id === groupId ? [...without, entryId] : without };
    }),
  };
}

/** Puts every entry into a group by seed, in snake order, so top seeds are spread across groups. */
export function autoAssignGroups(t: Tournament, by: string): Tournament {
  requireOrganiser(t, by);
  requireSetup(t);
  if (t.groups.length === 0) throw new MutationError("Add groups first.");
  const split = snakeAssign(seedOrder(t.entries).map((e) => e.id), t.groups.length);
  return { ...t, groups: t.groups.map((g, i) => ({ ...g, entryIds: split[i] })) };
}

export function renameGroup(t: Tournament, by: string, groupId: string, name: string): Tournament {
  requireOrganiser(t, by);
  if (!name.trim()) throw new MutationError("Group name can't be empty.");
  return { ...t, groups: t.groups.map((g) => (g.id === groupId ? { ...g, name: name.trim() } : g)) };
}

/** Adds a scorer to the tournament and to every match not yet closed. */
export function addTournamentScorer(t: Tournament, matches: Match[], by: string, user: string) {
  requireOrganiser(t, by);
  if (user === t.organiser || t.scorers.includes(user)) throw new MutationError(`${user} already has scoring access.`);
  const updatedMatches = matches
    .filter((m) => m.tournament?.id === t.id && m.status !== "closed" && !m.scorers.some((s) => s.user === user))
    .map((m) => addScorer(m, by, user));
  return { tournament: { ...t, scorers: [...t.scorers, user] }, matches: updatedMatches };
}

export function removeTournamentScorer(t: Tournament, by: string, user: string): Tournament {
  requireOrganiser(t, by);
  return { ...t, scorers: t.scorers.filter((s) => s !== user) };
}

function entryById(t: Tournament, id: string): Entry {
  const entry = t.entries.find((e) => e.id === id);
  if (!entry) throw new MutationError("Entry not found.");
  return entry;
}

export function fixtureLabel(t: Tournament, f: Fixture): string {
  if (f.stage === "group") {
    const group = t.groups.find((g) => g.id === f.groupId);
    return t.structure === "league" ? `League · Round ${f.round}` : `${group?.name ?? "Group"} · Round ${f.round}`;
  }
  const rounds = Math.max(...t.fixtures.filter((x) => x.stage === "knockout").map((x) => x.round));
  const name = roundName(f.round, rounds);
  const inRound = t.fixtures.filter((x) => x.stage === "knockout" && x.round === f.round).length;
  return inRound > 1 ? `${name} · Match ${f.index + 1}` : name;
}

function matchForFixture(t: Tournament, f: Fixture, a: string, b: string): Match {
  const ea = entryById(t, a);
  const eb = entryById(t, b);
  const label = fixtureLabel(t, f);
  const match = createMatch({
    sport: t.sport,
    title: `${t.name} · ${label}`,
    venue: t.venue,
    livestreamUrl: "",
    format: t.format,
    rules: t.rules,
    sides: { A: { name: ea.name, players: ea.players }, B: { name: eb.name, players: eb.players } },
    organiser: t.organiser,
    scorers: t.scorers,
  });
  return {
    ...match,
    sides: { A: { ...match.sides.A, entryId: a }, B: { ...match.sides.B, entryId: b } },
    tournament: { id: t.id, fixtureId: f.id, label },
  };
}

/** Creates matches for fixtures whose two sides are now known. */
function createReadyMatches(t: Tournament, matches: Matches): { tournament: Tournament; created: Match[] } {
  const created: Match[] = [];
  const all = { ...matches };
  const fixtures = t.fixtures.map((f) => ({ ...f }));
  const withFixtures = { ...t, fixtures };
  for (const f of fixtures) {
    if (f.matchId || isByeFixture(f)) continue;
    const { a, b } = resolveSides(f, fixtures, all);
    if (!a || !b) continue;
    const match = matchForFixture(withFixtures, f, a, b);
    f.matchId = match.id;
    all[match.id] = match;
    created.push(match);
  }
  return { tournament: withFixtures, created };
}

/** Locks entries and groups and creates the fixtures (and the matches that can be played now). */
export function generateFixtures(t: Tournament, by: string, matches: Matches) {
  requireOrganiser(t, by);
  requireSetup(t);
  if (t.entries.length < 2) throw new MutationError("Add at least two entries.");

  let next: Tournament;
  if (t.structure === "knockout") {
    const ranked = seedOrder(t.entries).map((e) => e.id);
    next = { ...t, fixtures: buildKnockout(ranked, newId), phase: "knockout" };
  } else {
    const groups = t.structure === "league" ? [{ id: newId(), name: "League", entryIds: t.entries.map((e) => e.id) }] : t.groups;
    if (t.structure === "groups_knockout") {
      const assigned = new Set(groups.flatMap((g) => g.entryIds));
      const missing = t.entries.filter((e) => !assigned.has(e.id));
      if (missing.length) throw new MutationError(`Put every entry in a group first (${missing.map((e) => e.name).join(", ")}).`);
      const small = groups.find((g) => g.entryIds.length < 2);
      if (small) throw new MutationError(`${small.name} needs at least two entries.`);
      const tooFew = groups.find((g) => g.entryIds.length < t.qualifiersPerGroup);
      if (tooFew) throw new MutationError(`${tooFew.name} has fewer entries than the number that qualify.`);
      if (groups.length * t.qualifiersPerGroup < 2) throw new MutationError("At least two entries must qualify for the knockout.");
    }
    const fixtures: Fixture[] = groups.flatMap((g) =>
      roundRobin(g.entryIds).flatMap((pairs, r) =>
        pairs.map(([a, b], i) => ({
          id: newId(),
          stage: "group" as const,
          groupId: g.id,
          round: r + 1,
          index: i,
          a: { type: "entry" as const, entryId: a },
          b: { type: "entry" as const, entryId: b },
        })),
      ),
    );
    next = { ...t, groups, fixtures, phase: "groups" };
  }
  return createReadyMatches(next, matches);
}

/** Groups → knockout: once every group match has a result, seeds the qualifiers into the bracket. */
export function startKnockout(t: Tournament, by: string, matches: Matches) {
  requireOrganiser(t, by);
  if (t.structure !== "groups_knockout" || t.phase !== "groups") throw new MutationError("The knockout can't be started now.");
  if (!groupStageComplete(t, matches)) throw new MutationError("Finish and close every group match first.");
  const ranked = qualifiers(t, matches);
  const knockout = buildKnockout(ranked, newId);
  return createReadyMatches({ ...t, fixtures: [...t.fixtures, ...knockout], phase: "knockout" }, matches);
}

/**
 * Brings the tournament up to date with match results: creates knockout matches that became ready,
 * corrects the sides of matches not yet started if an earlier result was edited, and marks the
 * tournament complete. Returns the same tournament object and no matches when nothing changed.
 */
export function syncTournament(t: Tournament, matches: Matches): { tournament: Tournament; created: Match[]; updated: Match[] } {
  if (t.phase === "setup") return { tournament: t, created: [], updated: [] };
  const updated: Match[] = [];
  for (const f of t.fixtures) {
    if (f.stage !== "knockout" || !f.matchId) continue;
    const match = matches[f.matchId];
    if (!match || match.status !== "scheduled") continue;
    const { a, b } = resolveSides(f, t.fixtures, matches);
    if (a && b && (match.sides.A.entryId !== a || match.sides.B.entryId !== b)) {
      const fresh = matchForFixture(t, f, a, b);
      updated.push({ ...match, sides: fresh.sides });
    }
  }
  const merged = { ...matches };
  for (const m of updated) merged[m.id] = m;
  const { tournament, created } = createReadyMatches(t, merged);
  for (const m of created) merged[m.id] = m;
  const done = !!champion(tournament, merged);
  const phase = done ? "complete" : tournament.phase === "complete" ? (t.structure === "league" ? "groups" : "knockout") : tournament.phase;
  if (created.length === 0 && updated.length === 0 && phase === t.phase) return { tournament: t, created, updated };
  return { tournament: { ...tournament, phase }, created, updated };
}

export function sportFormats(sport: SportKey): MatchFormat[] {
  // Badminton / table tennis team events become ties of several matches (coming next).
  return SPORTS[sport].formats.filter((f) => sport === "volleyball" || f !== "team");
}
