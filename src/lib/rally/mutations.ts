import { activeEvents, matchState } from "./engine";
import { describePoint } from "./commentary";
import { describeRules, validateRules } from "./rules";
import { SPORTS } from "./sports";
import type {
  ActionDef,
  AuditKind,
  DetailSettings,
  Match,
  MatchFormat,
  Player,
  RallyRules,
  Role,
  ScoreEvent,
  SideKey,
  SportKey,
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
    settings: { askHow: true, askWho: input.format !== "singles" },
    sides: { A: toSide("A"), B: toSide("B") },
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

function requireOrganiserOnClosed(match: Match, role: Role) {
  if (match.status !== "closed") throw new MutationError("This edit is only available after the match is closed.");
  if (role !== "organiser") throw new MutationError("Only the organiser or an admin can edit a closed match.");
}

export function startMatch(match: Match): Match {
  if (match.status !== "scheduled") throw new MutationError("Match has already started.");
  return { ...match, status: "live", startedAt: now() };
}

export function addPoint(match: Match, side: SideKey, by: string): { match: Match; event: ScoreEvent } {
  requireLive(match);
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
export function setLatestPointDetail(match: Match, eventId: string, detail: PointDetail): Match {
  requireLive(match);
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

export function closeMatch(match: Match, by: string): Match {
  requireLive(match);
  const state = matchState(match);
  const result = state.winner
    ? `${match.sides[state.winner].name} won ${state.setsWon[state.winner]}–${state.setsWon[state.winner === "A" ? "B" : "A"]}`
    : "no result";
  return audit({ ...match, status: "closed", closedAt: now(), closedBy: by }, "close", by, `Match closed (${result})`);
}

export function reopenMatch(match: Match, role: Role, by: string): Match {
  requireOrganiserOnClosed(match, role);
  return audit({ ...match, status: "live", closedAt: undefined, closedBy: undefined }, "reopen", by, "Match re-opened");
}

function summarise(match: Match, event: ScoreEvent) {
  return `${match.sides[event.side].name}: ${describePoint(match, event)}`;
}

export function editPoint(
  match: Match,
  role: Role,
  by: string,
  eventId: string,
  change: PointDetail & { side?: SideKey },
): Match {
  requireOrganiserOnClosed(match, role);
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
export function insertPoint(match: Match, role: Role, by: string, side: SideKey, beforeEventId: string | null): Match {
  requireOrganiserOnClosed(match, role);
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

export function deletePoint(match: Match, role: Role, by: string, eventId: string): Match {
  requireOrganiserOnClosed(match, role);
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
  if (match.status === "scheduled") return { ...match, rules: { ...rules } };

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

export function updateSettings(match: Match, settings: Partial<DetailSettings>): Match {
  return { ...match, settings: { ...match.settings, ...settings } };
}

export function updateActions(match: Match, actions: ActionDef[]): Match {
  return { ...match, actions };
}

export function isCorrected(match: Match): boolean {
  return match.history.some((h) => h.kind === "edit" || h.kind === "insert" || h.kind === "delete");
}
