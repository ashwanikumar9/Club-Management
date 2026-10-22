import { SPORTS, type ServeConfig } from "./sports";
import type { Match, RallyRules, ScoreEvent, SideKey } from "./types";

/** Rules can change during a match, so the engine asks for the rules of each set. */
export type RulesForSet = (setIndex: number) => RallyRules;

export interface SetScore {
  A: number;
  B: number;
  winner: SideKey | null;
}

export interface PointResult {
  event: ScoreEvent;
  /** 0-based index of the set this point was played in. */
  setIndex: number;
  /** Score of that set after this point. */
  score: { A: number; B: number };
  setsWon: { A: number; B: number };
  setWon: SideKey | null;
  matchWon: SideKey | null;
  /** Side holding set point after this point (null if none or set over). */
  setPoint: SideKey | null;
  /** Side holding match point after this point. */
  matchPoint: SideKey | null;
  /** True when the point was recorded after the match was already decided (only possible via edits). */
  ignored: boolean;
  /** Side that served this rally (when a toss was recorded). */
  server: SideKey | null;
  /** Players changed ends after this point (end of a set, or halfway through the deciding set). */
  endsChanged: boolean;
}

export interface MatchState {
  sets: SetScore[];
  /** Index of the set in play (or the last set when the match is over). */
  currentSet: number;
  setsWon: { A: number; B: number };
  setsToWin: number;
  winner: SideKey | null;
  points: PointResult[];
  setPoint: SideKey | null;
  matchPoint: SideKey | null;
  /** Rules in force for the current set. */
  rules: RallyRules;
  /** Side to serve the next rally (null without a toss or when the match is over). */
  server: SideKey | null;
  /** Side currently on the scorer's left. */
  left: SideKey;
}

/** Serving and ends tracking, from the toss and the sport's serve rules. */
export interface ServeTracking {
  firstServer: SideKey;
  left: SideKey;
  config: ServeConfig;
  /** Result of a new toss before the deciding set, when the sport has one. */
  deciding?: { firstServer: SideKey; left: SideKey };
}

/** Who serves the next rally of a set, given its score so far. */
function nextServer(
  t: ServeTracking,
  setFirst: SideKey,
  lastWinner: SideKey | null,
  score: { A: number; B: number },
  target: number,
): SideKey {
  if (t.config.rule === "rally_winner") return lastWinner ?? setFirst;
  const played = score.A + score.B;
  const base = target - 1; // deuce from base–base: service alternates every point
  const turn = played < 2 * base ? Math.floor(played / 2) : base + (played - 2 * base);
  return turn % 2 === 0 ? setFirst : other(setFirst);
}

export const other = (side: SideKey): SideKey => (side === "A" ? "B" : "A");

export function setsToWin(rules: RallyRules): number {
  return Math.floor(rules.bestOf / 2) + 1;
}

export function setTarget(rules: RallyRules, setIndex: number): number {
  return setIndex + 1 === rules.bestOf ? rules.decidingSetPoints : rules.pointsPerSet;
}

/** Whether `own` points beats `opp` points for a set with the given target. */
export function winsSet(own: number, opp: number, target: number, rules: RallyRules): boolean {
  if (rules.cap !== null && rules.cap >= target && own >= rules.cap && own > opp) return true;
  return own >= target && own - opp >= rules.winBy;
}

/** Whether the set in play is the deciding set and a new toss is still due before its first rally (volleyball). */
export function decidingTossDue(match: Match, state: MatchState): boolean {
  if (!SPORTS[match.sport].serve.decidingToss || !match.toss || match.toss.deciding || state.winner) return false;
  const set = state.sets[state.currentSet];
  return state.rules.bestOf > 1 && state.currentSet + 1 === state.rules.bestOf && set.A + set.B === 0;
}

/**
 * The break due after the latest point, in seconds: between sets, or when the leader reaches half the target
 * in sports with a mid-set interval (badminton: 60 s at 11). Null when none is due or the match is over.
 */
export function intervalDue(match: Match, state: MatchState): { seconds: number; between: boolean } | null {
  const last = state.points.filter((p) => !p.ignored).at(-1);
  if (!last || state.winner) return null;
  const intervals = SPORTS[match.sport].intervals;
  if (last.setWon) return { seconds: intervals.between, between: true };
  if (!intervals.mid) return null;
  const rules = rulesResolver(match)(last.setIndex);
  const half = Math.ceil(setTarget(rules, last.setIndex) / 2);
  const lead = Math.max(last.score.A, last.score.B);
  const before = lead - (last.score[last.event.side] === lead ? last.event.points : 0);
  return lead >= half && before < half ? { seconds: intervals.mid, between: false } : null;
}

export function activeEvents(events: ScoreEvent[]): ScoreEvent[] {
  return events.filter((e) => !e.undoneAt && !e.deletedAt).sort((a, b) => a.order - b.order);
}

function pointHolder(
  set: SetScore,
  setIndex: number,
  setsWon: { A: number; B: number },
  rules: RallyRules,
): { setPoint: SideKey | null; matchPoint: SideKey | null } {
  if (set.winner) return { setPoint: null, matchPoint: null };
  const target = setTarget(rules, setIndex);
  for (const side of ["A", "B"] as const) {
    if (winsSet(set[side] + 1, set[other(side)], target, rules)) {
      const matchPoint = setsWon[side] + 1 === setsToWin(rules) ? side : null;
      return { setPoint: side, matchPoint };
    }
  }
  return { setPoint: null, matchPoint: null };
}

/** Resolves the rules for each set from the starting rules and any changes made during the match. */
export function rulesResolver(match: Pick<Match, "rules" | "ruleChanges">): RulesForSet {
  const changes = [...(match.ruleChanges ?? [])].sort((a, b) => a.fromSet - b.fromSet);
  return (setIndex) => {
    let rules = match.rules;
    for (const change of changes) if (change.fromSet <= setIndex) rules = change.rules;
    return rules;
  };
}

/**
 * Full state of a match. A closed match with a retirement or walkover outcome counts as won by the
 * awarded side, so tables, brackets and scoreboards treat it like any other result.
 */
export function matchState(match: Match): MatchState {
  const tracking = match.toss
    ? { firstServer: match.toss.firstServer, left: match.toss.left, config: SPORTS[match.sport].serve, deciding: match.toss.deciding }
    : undefined;
  const state = computeState(match.events, rulesResolver(match), tracking);
  if (!state.winner && match.status === "closed" && match.outcome?.winner) {
    return { ...state, winner: match.outcome.winner, setPoint: null, matchPoint: null };
  }
  return state;
}

/** Replays the event log and derives the full match state. The log is the single source of truth. */
export function computeState(events: ScoreEvent[], rulesInput: RallyRules | RulesForSet, serve?: ServeTracking): MatchState {
  const rulesFor: RulesForSet = typeof rulesInput === "function" ? rulesInput : () => rulesInput;
  const sets: SetScore[] = [{ A: 0, B: 0, winner: null }];
  const setsWon = { A: 0, B: 0 };
  let winner: SideKey | null = null;
  const points: PointResult[] = [];
  let setFirst: SideKey = serve?.firstServer ?? "A";
  let lastWinner: SideKey | null = null;
  let left: SideKey = serve?.left ?? "A";

  for (const event of activeEvents(events)) {
    const setIndex = sets.length - 1;
    if (winner) {
      const last = sets[setIndex];
      points.push({
        event,
        setIndex,
        score: { A: last.A, B: last.B },
        setsWon: { ...setsWon },
        setWon: null,
        matchWon: null,
        setPoint: null,
        matchPoint: null,
        ignored: true,
        server: null,
        endsChanged: false,
      });
      continue;
    }

    const rules = rulesFor(setIndex);
    const set = sets[setIndex];
    const target = setTarget(rules, setIndex);
    const server = serve ? nextServer(serve, setFirst, lastWinner, set, target) : null;
    const leadBefore = Math.max(set.A, set.B);
    set[event.side] += event.points;
    lastWinner = event.side;
    let setWon: SideKey | null = null;
    let matchWon: SideKey | null = null;

    if (winsSet(set[event.side], set[other(event.side)], setTarget(rules, setIndex), rules)) {
      set.winner = event.side;
      setWon = event.side;
      setsWon[event.side] += 1;
      if (setsWon[event.side] >= setsToWin(rules)) {
        winner = event.side;
        matchWon = event.side;
      }
    }

    // Ends change after every set, and once halfway through the deciding set (or every N points when set).
    let endsChanged = false;
    const deciding = rules.bestOf > 1 && setIndex + 1 === rules.bestOf;
    const every = deciding ? (rules.decidingSwitchEvery ?? rules.switchEvery) : rules.switchEvery;
    if (setWon && !matchWon) endsChanged = true;
    else if (!setWon && every) {
      if ((set.A + set.B) % every === 0) endsChanged = true;
    } else if (!setWon && deciding) {
      const half = serve?.config.midSwitch === "floor" ? Math.floor(target / 2) : Math.ceil(target / 2);
      if (leadBefore < half && Math.max(set.A, set.B) >= half) endsChanged = true;
    }
    if (endsChanged) left = other(left);

    const holder = pointHolder(set, setIndex, setsWon, rules);
    points.push({
      event,
      setIndex,
      score: { A: set.A, B: set.B },
      setsWon: { ...setsWon },
      setWon,
      matchWon,
      setPoint: holder.setPoint,
      matchPoint: holder.matchPoint,
      ignored: false,
      server,
      endsChanged,
    });

    if (setWon && !matchWon) {
      sets.push({ A: 0, B: 0, winner: null });
      setFirst = serve?.config.nextSet === "set_winner" ? setWon : other(setFirst);
      lastWinner = null;
      const next = rulesFor(setIndex + 1);
      if (serve?.deciding && setIndex + 2 === next.bestOf) {
        setFirst = serve.deciding.firstServer;
        left = serve.deciding.left;
      }
    }
  }

  const currentSet = sets.length - 1;
  const rules = rulesFor(currentSet);
  const holder = winner
    ? { setPoint: null, matchPoint: null }
    : pointHolder(sets[currentSet], currentSet, setsWon, rules);

  return {
    sets,
    currentSet,
    setsWon,
    setsToWin: setsToWin(rules),
    winner,
    points,
    setPoint: holder.setPoint,
    matchPoint: holder.matchPoint,
    rules,
    server: serve && !winner ? nextServer(serve, setFirst, lastWinner, sets[currentSet], setTarget(rules, currentSet)) : null,
    left,
  };
}
