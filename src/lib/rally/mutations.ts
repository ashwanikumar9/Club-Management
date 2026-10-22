import { activeEvents, computeState, matchState, rulesResolver } from "./engine";
import { describePoint } from "./commentary";
import { describeOutcome } from "./outcome";
export { describeOutcome };
import { describeRules, validateRules } from "./rules";
import { SPORTS } from "./sports";
import type {
  ActionDef,
  AuditKind,
  DetailSettings,
  Match,
  MatchOutcome,
  MatchFormat,
  Player,
  RallyRules,
  ScoreEvent,
  SideKey,
  SportKey,
  TakeoverRequest,
} from "./types";

/** Mutations are pure: they take a match and return a new one, or throw a MutationError. */
export class MutationError extends Error {}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const now = () => new Date().toISOString();

export interface NewMatchInput {
  sport: SportKey;
  title: string;
  venue: string;
  livestreamUrl: string;
  format: MatchFormat;
  rules: RallyRules;
  sides: Record<SideKey, { name: string; players: Omit<Player, "id">[] }>;
  /** Identity key of the person creating the match. */
  organiser: string;
  /** Identity keys of people given scoring access up front. */
  scorers?: string[];
}

export function createMatch(input: NewMatchInput): Match {
  const sport = SPORTS[input.sport];
  const toSide = (side: SideKey) => ({
    name: input.sides[side].name.trim() || (side === "A" ? "Side A" : "Side B"),
    players: input.sides[side].players
      .filter((p) => p.name.trim())
      .map((p) => ({ id: newId(), name: p.name.trim(), jersey: p.jersey?.trim() || undefined })),
  });
  return {
    id: newId(),
    sport: input.sport,
    title: input.title.trim(),
    venue: input.venue.trim(),
    livestreamUrl: input.livestreamUrl.trim(),
    format: input.format,
    rules: { ...input.rules },
    ruleChanges: [],
    actions: structuredClone(sport.actions),
    // "Who scored" is for team sports (volleyball); doubles can switch it on during the match.
    settings: { askHow: true, askWho: input.format === "team" },
    sides: { A: toSide("A"), B: toSide("B") },
    organiser: input.organiser,
    scorers: [...new Set(input.scorers ?? [])]
      .filter((user) => user !== input.organiser)
      .map((user) => ({ user, addedBy: input.organiser, addedAt: now() })),
    status: "scheduled",
    createdAt: now(),
    events: [],
    history: [],
    version: 0,
  };
}

function audit(match: Match, kind: AuditKind, by: string, summary: string, eventId?: string): Match {
  return { ...match, history: [...match.history, { id: newId(), at: now(), by, kind, eventId, summary }] };
}

function requireLive(match: Match) {
  if (match.status !== "live") throw new MutationError("Scoring is only possible while the match is live.");
}

export function isOrganiser(match: Match, user: string | null): boolean {
  return !!user && match.organiser === user;
}

/** Organiser or anyone given scoring access. */
export function hasScoringAccess(match: Match, user: string | null): boolean {
  return !!user && (isOrganiser(match, user) || match.scorers.some((s) => s.user === user));
}

function requireAccess(match: Match, by: string) {
  if (!hasScoringAccess(match, by)) {
    throw new MutationError("You don't have scoring access to this match. Ask the organiser or a scorer to add you.");
  }
}

/** Single-scorer rule: only the person in control of scoring can change the score. */
function requireActiveScorer(match: Match, by: string) {
  requireAccess(match, by);
  if (match.activeScorer !== by) {
    throw new MutationError(
      match.activeScorer
        ? `${match.activeScorer} is scoring this match. Take over scoring to continue.`
        : "Nobody is scoring this match. Take over scoring to continue.",
    );
  }
}

function requireOrganiserOnClosed(match: Match, by: string) {
  if (match.status !== "closed") throw new MutationError("This edit is only available after the match is closed.");
  if (!isOrganiser(match, by)) throw new MutationError("Only the organiser or an admin can edit a closed match.");
}

export function startMatch(match: Match, by: string): Match {
  requireAccess(match, by);
  if (match.status !== "scheduled") throw new MutationError("Match has already started.");
  return { ...match, status: "live", startedAt: now(), activeScorer: by };
}

/** Gives another person scoring access. Any scorer can do this, e.g. before their battery runs out. */
export function addScorer(match: Match, by: string, user: string): Match {
  requireAccess(match, by);
  if (match.status === "closed") throw new MutationError("Scorers can't be added after the match is closed.");
  if (hasScoringAccess(match, user)) throw new MutationError(`${user} already has scoring access.`);
  const updated = { ...match, scorers: [...match.scorers, { user, addedBy: by, addedAt: now() }] };
  return audit(updated, "scorer", by, `${by} gave scoring access to ${user}`);
}

export function removeScorer(match: Match, by: string, user: string): Match {
  if (!isOrganiser(match, by)) throw new MutationError("Only the organiser can remove scorers.");
  if (!match.scorers.some((s) => s.user === user)) throw new MutationError(`${user} is not a scorer on this match.`);
  const updated = {
    ...voidTakeover(match),
    scorers: match.scorers.filter((s) => s.user !== user),
    activeScorer: match.activeScorer === user ? undefined : match.activeScorer,
  };
  return audit(updated, "scorer", by, `${by} removed scoring access for ${user}`);
}

/** Seconds the active scorer has to decline a take-over request before scoring passes automatically. */
export const TAKEOVER_SECONDS = 15;

export function pendingTakeover(match: Match): TakeoverRequest | undefined {
  return match.takeoverRequest?.status === "pending" ? match.takeoverRequest : undefined;
}

function decideTakeover(match: Match, status: TakeoverRequest["status"], at: Date): Match {
  return { ...match, takeoverRequest: { ...match.takeoverRequest!, status, decidedAt: at.toISOString() } };
}

/** Cancels a pending request when control changes some other way (hand-over, removal, close). */
function voidTakeover(match: Match, at: Date = new Date()): Match {
  return pendingTakeover(match) ? decideTakeover(match, "cancelled", at) : match;
}

/**
 * Asks to take over scoring. With nobody scoring, or when the organiser asks, control is taken immediately.
 * Otherwise the active scorer gets TAKEOVER_SECONDS to allow or decline; silence counts as allowing
 * (see settleTakeover).
 */
export function requestTakeover(match: Match, by: string, at: Date = new Date()): Match {
  requireAccess(match, by);
  if (match.status !== "live") throw new MutationError("Scoring can only be taken over while the match is live.");
  if (match.activeScorer === by) return match;
  if (!match.activeScorer) {
    return audit({ ...voidTakeover(match, at), activeScorer: by }, "scorer", by, `${by} took over scoring`);
  }
  if (isOrganiser(match, by)) {
    // The organiser never needs permission; this also overrides any pending request.
    const taken = { ...voidTakeover(match, at), activeScorer: by };
    return audit(taken, "scorer", by, `Organiser ${by} took over scoring from ${match.activeScorer}`);
  }
  const pending = pendingTakeover(match);
  if (pending) {
    throw new MutationError(
      pending.from === by ? "You have already asked to take over." : `${pending.from} has already asked to take over. Try again shortly.`,
    );
  }
  const request: TakeoverRequest = {
    id: newId(),
    from: by,
    to: match.activeScorer,
    requestedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + TAKEOVER_SECONDS * 1000).toISOString(),
    status: "pending",
  };
  return { ...match, takeoverRequest: request };
}

/** The active scorer allows or declines a pending take-over request. */
export function respondToTakeover(match: Match, by: string, allow: boolean, at: Date = new Date()): Match {
  const settled = settleTakeover(match, at);
  if (settled !== match) return settled; // already timed out: scoring has passed on
  const pending = pendingTakeover(match);
  if (!pending) throw new MutationError("There is no take-over request to answer.");
  if (pending.to !== by || match.activeScorer !== by) throw new MutationError("Only the current scorer can answer this request.");
  if (!allow) {
    return audit(decideTakeover(match, "declined", at), "scorer", by, `${by} declined ${pending.from}'s request to take over scoring`);
  }
  const allowed = { ...decideTakeover(match, "allowed", at), activeScorer: pending.from };
  return audit(allowed, "scorer", by, `${by} handed scoring over to ${pending.from} on request`);
}

export function cancelTakeover(match: Match, by: string, at: Date = new Date()): Match {
  const pending = pendingTakeover(match);
  if (!pending || pending.from !== by) throw new MutationError("You have no pending take-over request.");
  return decideTakeover(match, "cancelled", at);
}

/**
 * Completes a pending request whose time is up. Any device with the match open may call this; it returns
 * the same match object when there is nothing to do.
 */
export function settleTakeover(match: Match, at: Date = new Date()): Match {
  const pending = pendingTakeover(match);
  if (!pending || at.getTime() < new Date(pending.expiresAt).getTime()) return match;
  if (match.status !== "live" || match.activeScorer !== pending.to || !hasScoringAccess(match, pending.from)) {
    return decideTakeover(match, "cancelled", at);
  }
  const taken = { ...decideTakeover(match, "auto", at), activeScorer: pending.from };
  return audit(
    taken,
    "scorer",
    pending.from,
    `${pending.from} took over scoring from ${pending.to} (no response within ${TAKEOVER_SECONDS} seconds)`,
  );
}

/** The current scorer passes control to another person with scoring access. */
export function handOverScoring(match: Match, by: string, to: string): Match {
  requireActiveScorer(match, by);
  if (!hasScoringAccess(match, to)) throw new MutationError(`${to} doesn't have scoring access.`);
  if (to === by) return match;
  return audit({ ...voidTakeover(match), activeScorer: to }, "scorer", by, `${by} handed scoring over to ${to}`);
}

export function addPoint(match: Match, side: SideKey, by: string): { match: Match; event: ScoreEvent } {
  requireLive(match);
  requireActiveScorer(match, by);
  if (matchState(match).winner) {
    throw new MutationError("The match is already decided. Close the match or undo the last point.");
  }
  const lastOrder = match.events.reduce((max, e) => Math.max(max, e.order), 0);
  const event: ScoreEvent = { id: newId(), order: lastOrder + 1, side, points: 1, createdAt: now(), createdBy: by };
  return { match: { ...match, events: [...match.events, event] }, event };
}

export interface PointDetail {
  actionKey?: string | null;
  actorId?: string | null;
  note?: string;
}

function applyDetail(match: Match, event: ScoreEvent, detail: PointDetail): ScoreEvent {
  const next = { ...event };
  if (detail.actionKey !== undefined) {
    const action = detail.actionKey ? match.actions.find((a) => a.key === detail.actionKey) : undefined;
    if (action) {
      const keepTemplate = event.action?.key === action.key && action.templates.includes(event.action.template);
      const template = keepTemplate
        ? event.action!.template
        : action.templates[Math.floor(Math.random() * action.templates.length)] ?? "{player} wins the point";
      // The credited side changes with the action type, so drop a player that no longer fits.
      if (event.action && event.action.credit !== action.credit && detail.actorId === undefined) {
        next.actorId = undefined;
      }
      next.action = { key: action.key, label: action.label, credit: action.credit, template };
    } else {
      next.action = undefined;
    }
  }
  if (detail.actorId !== undefined) next.actorId = detail.actorId ?? undefined;
  if (detail.note !== undefined) next.note = detail.note.trim() || undefined;
  return next;
}

/** Adds "how" / "who" detail to the point that was just scored (only the latest point, while live). */
export function setLatestPointDetail(match: Match, by: string, eventId: string, detail: PointDetail): Match {
  requireLive(match);
  requireActiveScorer(match, by);
  const last = activeEvents(match.events).at(-1);
  if (!last || last.id !== eventId) {
    throw new MutationError("A newer point has been recorded. Use undo to correct earlier points.");
  }
  return { ...match, events: match.events.map((e) => (e.id === eventId ? applyDetail(match, e, detail) : e)) };
}

/**
 * Undoes the most recent point. `expectedEventId` is the point the user saw on the undo button;
 * if another scorer recorded a newer point in the meantime the undo is refused.
 */
export function undoLast(match: Match, expectedEventId: string, by: string): Match {
  requireLive(match);
  requireActiveScorer(match, by);
  const last = activeEvents(match.events).at(-1);
  if (!last) throw new MutationError("Nothing to undo.");
  if (last.id !== expectedEventId) {
    throw new MutationError("The score changed while you were undoing. Check the latest point and try again.");
  }
  return {
    ...match,
    events: match.events.map((e) => (e.id === last.id ? { ...e, undoneAt: now(), undoneBy: by } : e)),
  };
}

function checkOutcome(outcome: MatchOutcome) {
  if (outcome.type !== "no_result" && outcome.winner !== "A" && outcome.winner !== "B") {
    throw new MutationError("Choose who is awarded the match.");
  }
}

/**
 * Closes the match. A finished match closes with its result. An unfinished one needs an outcome chosen by
 * the scorer or organiser: a retirement, a walkover (also possible before the match starts), or no result.
 */
export function closeMatch(match: Match, by: string, outcome?: MatchOutcome): Match {
  if (match.status === "scheduled") {
    requireAccess(match, by);
    if (outcome?.type !== "walkover" && outcome?.type !== "no_result") {
      throw new MutationError("A match that hasn't started can only be closed as a walkover or no result.");
    }
  } else {
    requireLive(match);
    if (!isOrganiser(match, by)) requireActiveScorer(match, by);
  }
  const natural = computeState(match.events, rulesResolver(match)).winner;
  if (natural && outcome) throw new MutationError("The match already has a winner.");
  if (!natural) {
    if (!outcome) throw new MutationError("Choose how the match ended: retirement, walkover or no result.");
    checkOutcome(outcome);
  }
  const closed = {
    ...voidTakeover(match),
    status: "closed" as const,
    closedAt: now(),
    closedBy: by,
    activeScorer: undefined,
    outcome: natural ? undefined : { type: outcome!.type, winner: outcome!.type === "no_result" ? undefined : outcome!.winner },
  };
  const state = matchState(closed);
  const result = natural
    ? `${match.sides[natural].name} won ${state.setsWon[natural]}–${state.setsWon[natural === "A" ? "B" : "A"]}`
    : describeOutcome(match, closed.outcome!);
  return audit(closed, "close", by, `Match closed (${result})`);
}

/** Organiser changes how an unfinished closed match is recorded (e.g. retirement → walkover, or the awarded side). */
export function setOutcome(match: Match, by: string, outcome: MatchOutcome): Match {
  requireOrganiserOnClosed(match, by);
  if (computeState(match.events, rulesResolver(match)).winner) {
    throw new MutationError("This match was played to a finish; edit the points instead.");
  }
  checkOutcome(outcome);
  const next = { ...match, outcome: { type: outcome.type, winner: outcome.type === "no_result" ? undefined : outcome.winner } };
  return audit(next, "edit", by, `Result changed to: ${describeOutcome(match, next.outcome)}`);
}

export function reopenMatch(match: Match, by: string): Match {
  requireOrganiserOnClosed(match, by);
  const reopened = {
    ...match,
    status: "live" as const,
    closedAt: undefined,
    closedBy: undefined,
    activeScorer: by,
    outcome: undefined,
    startedAt: match.startedAt ?? now(),
  };
  return audit(reopened, "reopen", by, "Match re-opened");
}

function summarise(match: Match, event: ScoreEvent) {
  return `${match.sides[event.side].name}: ${describePoint(match, event)}`;
}

export function editPoint(
  match: Match,
  by: string,
  eventId: string,
  change: PointDetail & { side?: SideKey },
): Match {
  requireOrganiserOnClosed(match, by);
  const event = match.events.find((e) => e.id === eventId && !e.undoneAt && !e.deletedAt);
  if (!event) throw new MutationError("Point not found.");
  let next = applyDetail(match, event, change);
  if (change.side && change.side !== event.side) {
    next = { ...next, side: change.side, actorId: undefined };
  }
  const updated = { ...match, events: match.events.map((e) => (e.id === eventId ? next : e)) };
  return audit(updated, "edit", by, `Edited point. Before: ${summarise(match, event)}. After: ${summarise(match, next)}`, eventId);
}

/** Inserts a missed point before `beforeEventId` (or at the end when null). */
export function insertPoint(match: Match, by: string, side: SideKey, beforeEventId: string | null): Match {
  requireOrganiserOnClosed(match, by);
  const list = activeEvents(match.events);
  let order: number;
  if (beforeEventId === null) {
    order = (list.at(-1)?.order ?? 0) + 1;
  } else {
    const index = list.findIndex((e) => e.id === beforeEventId);
    if (index < 0) throw new MutationError("Point not found.");
    const prevOrder = index > 0 ? list[index - 1].order : 0;
    order = (prevOrder + list[index].order) / 2;
  }
  const event: ScoreEvent = { id: newId(), order, side, points: 1, createdAt: now(), createdBy: by };
  const updated = { ...match, events: [...match.events, event] };
  return audit(updated, "insert", by, `Added missed point: ${summarise(match, event)}`, event.id);
}

export function deletePoint(match: Match, by: string, eventId: string): Match {
  requireOrganiserOnClosed(match, by);
  const event = match.events.find((e) => e.id === eventId && !e.undoneAt && !e.deletedAt);
  if (!event) throw new MutationError("Point not found.");
  const updated = { ...match, events: match.events.map((e) => (e.id === eventId ? { ...e, deletedAt: now() } : e)) };
  return audit(updated, "delete", by, `Deleted point: ${summarise(match, event)}`, eventId);
}

/**
 * Changes the scoring rules. Before the start this replaces the starting rules. While live the new
 * rules apply from the current set onwards; finished sets keep the rules they were played under.
 * A change that would instantly end the current set or the match is refused, since the scorer should
 * record the deciding point themselves.
 */
export function changeRules(match: Match, rules: RallyRules, by: string): Match {
  const invalid = validateRules(rules);
  if (invalid) throw new MutationError(invalid);
  if (match.status === "closed") throw new MutationError("Rules cannot be changed after the match is closed.");
  requireAccess(match, by);
  if (match.status === "scheduled") return { ...match, rules: { ...rules } };
  if (!isOrganiser(match, by)) requireActiveScorer(match, by);

  const before = matchState(match);
  const fromSet = before.currentSet;
  if (fromSet + 1 > rules.bestOf) {
    throw new MutationError(`'Best of' cannot be lower than the ${fromSet + 1} ${SPORTS[match.sport].setLabel.toLowerCase()}s already reached.`);
  }
  const ruleChanges = [
    ...(match.ruleChanges ?? []).filter((c) => c.fromSet !== fromSet),
    { id: newId(), fromSet, rules: { ...rules }, at: now(), by },
  ];
  const updated = { ...match, ruleChanges };
  const after = matchState(updated);
  const finished = (s: typeof before) => s.sets.filter((x) => x.winner).length;
  const unit = SPORTS[match.sport].setLabel.toLowerCase();
  if (finished(after) !== finished(before)) {
    const score = `${before.sets[fromSet].A}–${before.sets[fromSet].B}`;
    throw new MutationError(`These rules would end the current ${unit} immediately at ${score}. Choose a higher target.`);
  }
  if (after.winner !== before.winner) {
    throw new MutationError(`These rules would end the match immediately. Choose a higher 'best of'.`);
  }
  const label = SPORTS[match.sport].setLabel;
  return audit(updated, "rules", by, `Rules changed from ${label} ${fromSet + 1}: ${describeRules(rules, label)}`);
}

export function updateSettings(match: Match, by: string, settings: Partial<DetailSettings>): Match {
  requireAccess(match, by);
  return { ...match, settings: { ...match.settings, ...settings } };
}

export function updateActions(match: Match, by: string, actions: ActionDef[]): Match {
  requireAccess(match, by);
  return { ...match, actions };
}

export function isCorrected(match: Match): boolean {
  return match.history.some((h) => h.kind === "edit" || h.kind === "insert" || h.kind === "delete");
}
