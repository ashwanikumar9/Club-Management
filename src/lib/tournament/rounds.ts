import { MutationError, newId } from "../rally/mutations";
import type { Match } from "../rally/types";
import type { Tie } from "../tie/types";
import { buildKnockout, fixtureOutcome, resolveSides, roundRobin, snakeAssign, type Data } from "./engine";
import { canManageTournament } from "./access";
import { createReady, matchForFixture, tieForFixture } from "./mutations";
import type { Fixture, Group, Stage, Tournament } from "./types";

const GROUP_LETTERS = "ABCDEFGHIJKLMNOP";

/** Result of a change that may also create, change or remove matches and ties. */
export interface RoundsResult {
  tournament: Tournament;
  matches: Match[];
  ties: Tie[];
  deleteMatches: string[];
  deleteTies: string[];
}

function requireOrganiser(t: Tournament, by: string) {
  if (!canManageTournament(t, by)) throw new MutationError("Only the organiser can change rounds and fixtures.");
}

function requireStarted(t: Tournament) {
  if (t.phase === "setup") throw new MutationError("Generate the main fixtures first.");
}

/** A fixture can be changed while its match / tie hasn't started. */
function started(f: Fixture, data: Data): boolean {
  const outcome = fixtureOutcome(f, data);
  return outcome.status === "live" || outcome.status === "closed";
}

function finish(t: Tournament, data: Data, removed: Fixture[] = []): RoundsResult {
  const ready = createReady(t, data);
  return {
    tournament: ready.tournament,
    matches: ready.created,
    ties: ready.ties,
    deleteMatches: removed.map((f) => f.matchId).filter((id): id is string => !!id),
    deleteTies: removed.map((f) => f.tieId).filter((id): id is string => !!id),
  };
}

export interface NewStage {
  name: string;
  kind: Stage["kind"];
  /** Entries taking part, in seeding order for a knockout (first = top seed). */
  entryIds: string[];
  /** League rounds: number of groups (entries are spread in snake order). */
  groupCount?: number;
  thirdPlace?: boolean;
}

/**
 * Adds an extra round: a round-robin ("league") in one or more groups, a seeded knockout, or an empty set
 * of one-off matches to fill in by hand. Matches are created for every fixture whose sides are known.
 */
export function addStage(t: Tournament, by: string, data: Data, input: NewStage): RoundsResult {
  requireOrganiser(t, by);
  requireStarted(t);
  const name = input.name.trim();
  if (!name) throw new MutationError("Give the round a name, e.g. Super 4 or Plate.");
  if ((t.stages ?? []).some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new MutationError(`There is already a round called ${name}.`);
  const entryIds = [...new Set(input.entryIds)].filter((id) => t.entries.some((e) => e.id === id));
  if (input.kind !== "matches" && entryIds.length < 2) throw new MutationError("Choose at least two entries for this round.");

  const stage: Stage = { id: newId(), name, kind: input.kind, entryIds, groups: [], thirdPlace: !!input.thirdPlace };
  let fixtures: Fixture[] = [];
  if (input.kind === "league") {
    const count = Math.max(1, Math.min(input.groupCount ?? 1, Math.floor(entryIds.length / 2)));
    const split = snakeAssign(entryIds, count);
    stage.groups = split.map((ids, i): Group => ({ id: newId(), name: count === 1 ? name : `Group ${GROUP_LETTERS[i]}`, entryIds: ids }));
    fixtures = stage.groups.flatMap((g) =>
      roundRobin(g.entryIds).flatMap((pairs, r) =>
        pairs.map(([a, b], i): Fixture => ({
          id: newId(),
          stage: "group",
          groupId: g.id,
          stageId: stage.id,
          round: r + 1,
          index: i,
          a: { type: "entry", entryId: a },
          b: { type: "entry", entryId: b },
        })),
      ),
    );
  } else if (input.kind === "knockout") {
    fixtures = buildKnockout(entryIds, newId, stage.thirdPlace).map((f) => ({ ...f, stageId: stage.id }));
  }
  return finish({ ...t, stages: [...(t.stages ?? []), stage], fixtures: [...t.fixtures, ...fixtures] }, data);
}

/** Removes an extra round, as long as none of its matches has started. */
export function removeStage(t: Tournament, by: string, data: Data, stageId: string): RoundsResult {
  requireOrganiser(t, by);
  const fixtures = t.fixtures.filter((f) => f.stageId === stageId);
  if (fixtures.some((f) => started(f, data))) throw new MutationError("Some matches in this round have started, so it can't be removed.");
  return finish(
    { ...t, stages: (t.stages ?? []).filter((s) => s.id !== stageId), fixtures: t.fixtures.filter((f) => f.stageId !== stageId) },
    data,
    fixtures,
  );
}

/**
 * Adds a single fixture between two entries: to a group of the main league / group stage, to a league
 * round's group, or to a round of one-off matches.
 */
export function addFixture(t: Tournament, by: string, data: Data, where: { groupId?: string; stageId?: string }, a: string, b: string): RoundsResult {
  requireOrganiser(t, by);
  requireStarted(t);
  if (a === b) throw new MutationError("Choose two different entries.");
  if (![a, b].every((id) => t.entries.some((e) => e.id === id))) throw new MutationError("Choose two entries.");
  const stage = where.stageId ? (t.stages ?? []).find((s) => s.id === where.stageId) : undefined;
  if (where.stageId && !stage) throw new MutationError("Round not found.");
  if (stage?.kind === "knockout") throw new MutationError("Knockout rounds are built from their bracket; re-pair a fixture instead.");
  const group = where.groupId ? [...t.groups, ...(stage?.groups ?? [])].find((g) => g.id === where.groupId) : undefined;
  if (where.groupId && !group) throw new MutationError("Group not found.");
  if (!group && !stage) throw new MutationError("Choose where the match belongs.");

  const siblings = t.fixtures.filter((f) => (group ? f.groupId === group.id : f.stageId === stage!.id));
  const fixture: Fixture = {
    id: newId(),
    stage: group ? "group" : "knockout",
    groupId: group?.id,
    stageId: stage?.id,
    round: group ? Math.max(0, ...siblings.map((f) => f.round)) + 1 : 1,
    index: group ? 0 : siblings.length,
    a: { type: "entry", entryId: a },
    b: { type: "entry", entryId: b },
  };
  const next = { ...t, fixtures: [...t.fixtures, fixture] };
  // Keep group membership in step so the entry shows in that group's table.
  if (group) {
    const patch = (g: Group) => (g.id === group.id ? { ...g, entryIds: [...new Set([...g.entryIds, a, b])] } : g);
    next.groups = next.groups.map(patch);
    next.stages = (next.stages ?? []).map((s) => ({ ...s, groups: s.groups.map(patch) }));
  }
  return finish(next, data);
}

/**
 * Sets who plays in a fixture that hasn't started (e.g. after a withdrawal, or to fix a draw). The sides
 * become fixed entries; the match or tie is updated, or created if it didn't exist yet.
 */
export function setFixtureSides(t: Tournament, by: string, data: Data, fixtureId: string, a: string, b: string): RoundsResult {
  requireOrganiser(t, by);
  const f = t.fixtures.find((x) => x.id === fixtureId);
  if (!f) throw new MutationError("Fixture not found.");
  if (started(f, data)) throw new MutationError("This match has started; its players can't change.");
  if (a === b) throw new MutationError("Choose two different entries.");
  const updated: Fixture = { ...f, a: { type: "entry", entryId: a }, b: { type: "entry", entryId: b } };
  const next = { ...t, fixtures: t.fixtures.map((x) => (x.id === fixtureId ? updated : x)) };
  const result = finish(next, data);
  if (f.matchId && data.matches[f.matchId]) {
    const match = data.matches[f.matchId];
    result.matches.push({ ...match, sides: matchForFixture(next, updated, a, b).sides });
  }
  if (f.tieId && data.ties[f.tieId]) {
    const fresh = tieForFixture(next, updated, a, b);
    result.ties.push({ ...data.ties[f.tieId], title: fresh.title, teams: fresh.teams, slots: fresh.slots });
  }
  return result;
}

/** Swaps the two sides of a fixture that hasn't started. */
export function swapFixtureSides(t: Tournament, by: string, data: Data, fixtureId: string): RoundsResult {
  const f = t.fixtures.find((x) => x.id === fixtureId);
  if (!f) throw new MutationError("Fixture not found.");
  const { a, b } = resolveSides(f, t.fixtures, data);
  if (!a || !b) throw new MutationError("Both sides need to be known before they can be swapped.");
  return setFixtureSides(t, by, data, fixtureId, b, a);
}

/**
 * Deletes a fixture that hasn't started. Knockout fixtures that feed a later round can't be deleted
 * (re-pair them instead).
 */
export function deleteFixture(t: Tournament, by: string, data: Data, fixtureId: string): RoundsResult {
  requireOrganiser(t, by);
  const f = t.fixtures.find((x) => x.id === fixtureId);
  if (!f) throw new MutationError("Fixture not found.");
  if (started(f, data)) throw new MutationError("This match has started, so it can't be deleted.");
  const feeds = t.fixtures.some((x) => [x.a, x.b].some((s) => (s.type === "winner" || s.type === "loser") && s.fixtureId === fixtureId));
  if (feeds) throw new MutationError("This match decides a later round. Change its players instead of deleting it.");
  return finish({ ...t, fixtures: t.fixtures.filter((x) => x.id !== fixtureId) }, data, [f]);
}
