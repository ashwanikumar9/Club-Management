import type { RallyRules, ScoreEvent, SideKey } from "./types";

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

/** Replays the event log and derives the full match state. The log is the single source of truth. */
export function computeState(events: ScoreEvent[], rules: RallyRules): MatchState {
  const toWin = setsToWin(rules);
  const sets: SetScore[] = [{ A: 0, B: 0, winner: null }];
  const setsWon = { A: 0, B: 0 };
  let winner: SideKey | null = null;
  const points: PointResult[] = [];

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
      });
      continue;
    }

    const set = sets[setIndex];
    set[event.side] += event.points;
    let setWon: SideKey | null = null;
    let matchWon: SideKey | null = null;

    if (winsSet(set[event.side], set[other(event.side)], setTarget(rules, setIndex), rules)) {
      set.winner = event.side;
      setWon = event.side;
      setsWon[event.side] += 1;
      if (setsWon[event.side] === toWin) {
        winner = event.side;
        matchWon = event.side;
      }
    }

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
    });

    if (setWon && !matchWon) sets.push({ A: 0, B: 0, winner: null });
  }

  const currentSet = sets.length - 1;
  const holder = winner
    ? { setPoint: null, matchPoint: null }
    : pointHolder(sets[currentSet], currentSet, setsWon, rules);

  return {
    sets,
    currentSet,
    setsWon,
    setsToWin: toWin,
    winner,
    points,
    setPoint: holder.setPoint,
    matchPoint: holder.matchPoint,
  };
}
