import { MutationError, addScorer, createMatch, newId } from "../rally/mutations";
import { validateRules } from "../rally/rules";
import { SPORTS } from "../rally/sports";
import type { Match, MatchFormat, RallyRules, SportKey } from "../rally/types";
import { createTie } from "../tie/tie";
import type { Tie } from "../tie/types";
import {
  buildKnockout,
  groupStageComplete,
  isByeFixture,
  fixtureOutcome,
  qualifiers,
  resolveSides,
  roundName,
  roundRobin,
  seedOrder,
  snakeAssign,
  thirdPlaceFixture,
  tournamentFinished,
  type Data,
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
  thirdPlace?: boolean;
  /** Matches per tie for badminton / table tennis team events. */
  tieMatchCount?: number;
}

/** Whether fixtures are team ties (badminton / table tennis team events) rather than single matches. */
export function usesTies(t: Pick<Tournament, "sport" | "format">): boolean {
  return t.format === "team" && t.sport !== "volleyball";
}

export function createTournament(input: NewTournamentInput): Tournament {
  if (!input.name.trim()) throw new MutationError("Give the tournament a name.");
  const invalid = validateRules(input.rules);
  if (invalid) throw new MutationError(invalid);
  const ties = usesTies(input);
  const tieMatchCount = input.tieMatchCount ?? 5;
  if (ties && (!Number.isInteger(tieMatchCount) || tieMatchCount < 1 || tieMatchCount > 9 || tieMatchCount % 2 === 0)) {
    throw new MutationError("A tie has an odd number of matches between 1 and 9.");
  }
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
    thirdPlace: input.thirdPlace ?? false,
    tieMatchCount: ties ? tieMatchCount : undefined,
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

/**
 * Turns the third-place match on or off. Before fixtures exist this is just a setting; once the knockout
 * exists the play-off is added, or removed if it hasn't been created as a match yet.
 */
export function setThirdPlace(t: Tournament, by: string, on: boolean): Tournament {
  requireOrganiser(t, by);
  if (t.structure === "league") throw new MutationError("A league has no knockout, so there's no third-place match.");
  const existing = t.fixtures.find((f) => f.third);
  if (on && !existing && t.fixtures.some((f) => f.stage === "knockout")) {
    const fixture = thirdPlaceFixture(t.fixtures, newId);
    if (!fixture) throw new MutationError("The bracket has no semi-finals, so there's no third-place match.");
    return { ...t, thirdPlace: true, fixtures: [...t.fixtures, fixture], phase: t.phase === "complete" ? "knockout" : t.phase };
  }
  if (!on && existing) {
    if (existing.matchId || existing.tieId) throw new MutationError("The third-place match has already been set up and can't be removed.");
    return { ...t, thirdPlace: false, fixtures: t.fixtures.filter((f) => !f.third) };
  }
  return { ...t, thirdPlace: on };
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
export function addTournamentScorer(t: Tournament, data: Data, by: string, user: string) {
  requireOrganiser(t, by);
  if (user === t.organiser || t.scorers.includes(user)) throw new MutationError(`${user} already has scoring access.`);
  const tieIds = new Set(t.fixtures.map((f) => f.tieId).filter(Boolean));
  const ties = Object.values(data.ties)
    .filter((x) => tieIds.has(x.id) && !x.scorers.includes(user))
    .map((x) => ({ ...x, scorers: [...x.scorers, user] }));
  const inTournament = (m: Match) => m.tournament?.id === t.id || (!!m.tie && tieIds.has(m.tie.id));
  const updatedMatches = Object.values(data.matches)
    .filter((m) => inTournament(m) && m.status !== "closed" && !m.scorers.some((s) => s.user === user))
    .map((m) => addScorer(m, by, user));
  return { tournament: { ...t, scorers: [...t.scorers, user] }, matches: updatedMatches, ties };
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
  if (f.third) return "Third place";
  const rounds = Math.max(...t.fixtures.filter((x) => x.stage === "knockout").map((x) => x.round));
  const name = roundName(f.round, rounds);
  const inRound = t.fixtures.filter((x) => x.stage === "knockout" && x.round === f.round && !x.third).length;
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

function tieForFixture(t: Tournament, f: Fixture, a: string, b: string): Tie {
  const ea = entryById(t, a);
  const eb = entryById(t, b);
  const label = fixtureLabel(t, f);
  const tie = createTie({
    sport: t.sport as Tie["sport"],
    title: `${t.name} · ${label} · ${ea.name} vs ${eb.name}`,
    venue: t.venue,
    rules: t.rules,
    teams: { A: { name: ea.name, players: ea.players, entryId: a }, B: { name: eb.name, players: eb.players, entryId: b } },
    matchCount: t.tieMatchCount ?? 5,
    lineupMode: "at_start",
    organiser: t.organiser,
    scorers: t.scorers,
  });
  return { ...tie, tournament: { id: t.id, fixtureId: f.id, label } };
}

export interface Created {
  tournament: Tournament;
  created: Match[];
  ties: Tie[];
}

/** Creates the match (or team tie) for each fixture whose two sides are now known. */
function createReady(t: Tournament, data: Data): Created {
  const created: Match[] = [];
  const ties: Tie[] = [];
  const all: Data = { matches: { ...data.matches }, ties: { ...data.ties } };
  const fixtures = t.fixtures.map((f) => ({ ...f }));
  const withFixtures = { ...t, fixtures };
  for (const f of fixtures) {
    if (f.matchId || f.tieId || isByeFixture(f)) continue;
    const { a, b } = resolveSides(f, fixtures, all);
    if (!a || !b) continue;
    if (usesTies(t)) {
      const tie = tieForFixture(withFixtures, f, a, b);
      f.tieId = tie.id;
      all.ties[tie.id] = tie;
      ties.push(tie);
    } else {
      const match = matchForFixture(withFixtures, f, a, b);
      f.matchId = match.id;
      all.matches[match.id] = match;
      created.push(match);
    }
  }
  return { tournament: withFixtures, created, ties };
}

/** Locks entries and groups and creates the fixtures (and the matches that can be played now). */
export function generateFixtures(t: Tournament, by: string, data: Data): Created {
  requireOrganiser(t, by);
  requireSetup(t);
  if (t.entries.length < 2) throw new MutationError("Add at least two entries.");

  let next: Tournament;
  if (t.structure === "knockout") {
    const ranked = seedOrder(t.entries).map((e) => e.id);
    next = { ...t, fixtures: buildKnockout(ranked, newId, t.thirdPlace), phase: "knockout" };
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
  return createReady(next, data);
}

/** Groups → knockout: once every group match has a result, seeds the qualifiers into the bracket. */
export function startKnockout(t: Tournament, by: string, data: Data): Created {
  requireOrganiser(t, by);
  if (t.structure !== "groups_knockout" || t.phase !== "groups") throw new MutationError("The knockout can't be started now.");
  if (!groupStageComplete(t, data)) throw new MutationError("Finish and close every group match first.");
  const ranked = qualifiers(t, data);
  const knockout = buildKnockout(ranked, newId, t.thirdPlace);
  return createReady({ ...t, fixtures: [...t.fixtures, ...knockout], phase: "knockout" }, data);
}

/**
 * Brings the tournament up to date with results: creates knockout matches / ties that became ready,
 * corrects the sides of ones not yet started if an earlier result was edited, and marks the tournament
 * complete. Returns the same tournament object and empty lists when nothing changed.
 */
export function syncTournament(t: Tournament, data: Data): Created & { updated: Match[]; updatedTies: Tie[] } {
  const none = { tournament: t, created: [], ties: [], updated: [], updatedTies: [] };
  if (t.phase === "setup") return none;
  const updated: Match[] = [];
  const updatedTies: Tie[] = [];
  for (const f of t.fixtures) {
    if (f.stage !== "knockout" || (!f.matchId && !f.tieId)) continue;
    const { a, b } = resolveSides(f, t.fixtures, data);
    if (!a || !b) continue;
    const current = fixtureOutcome(f, data);
    if (current.entries.A === a && current.entries.B === b) continue;
    if (f.matchId) {
      const match = data.matches[f.matchId];
      if (match?.status === "scheduled") updated.push({ ...match, sides: matchForFixture(t, f, a, b).sides });
    } else {
      const tie = data.ties[f.tieId!];
      const started = tie?.slots.some((s) => s.matchId);
      if (tie && !started) {
        const fresh = tieForFixture(t, f, a, b);
        updatedTies.push({ ...tie, title: fresh.title, teams: fresh.teams, slots: fresh.slots });
      }
    }
  }
  const merged: Data = { matches: { ...data.matches }, ties: { ...data.ties } };
  for (const m of updated) merged.matches[m.id] = m;
  for (const x of updatedTies) merged.ties[x.id] = x;
  const ready = createReady(t, merged);
  for (const m of ready.created) merged.matches[m.id] = m;
  for (const x of ready.ties) merged.ties[x.id] = x;
  const finished = tournamentFinished(ready.tournament, merged);
  const playing = t.structure === "league" || (t.structure === "groups_knockout" && !t.fixtures.some((f) => f.stage === "knockout")) ? "groups" : "knockout";
  const phase = finished ? "complete" : t.phase === "complete" ? playing : t.phase;
  if (!ready.created.length && !ready.ties.length && !updated.length && !updatedTies.length && phase === t.phase) return none;
  return { ...ready, tournament: { ...ready.tournament, phase }, updated, updatedTies };
}

export function sportFormats(sport: SportKey): MatchFormat[] {
  return SPORTS[sport].formats;
}
