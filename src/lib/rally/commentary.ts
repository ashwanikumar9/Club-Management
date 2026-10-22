import { other, type MatchState } from "./engine";
import { describeRules } from "./rules";
import { describeOutcome } from "./outcome";
import { SPORTS } from "./sports";
import type { Match, ScoreEvent, SideKey } from "./types";

export interface CommentaryLine {
  id: string;
  kind: "point" | "system";
  text: string;
  at: string;
  /** Set number (1-based) the line belongs to. */
  set: number;
  /** Score of the current set after this line, e.g. "12–10". */
  score?: string;
  side?: SideKey;
  highlight?: boolean;
}

export function playerName(match: Match, side: SideKey, playerId?: string): string | undefined {
  const players = match.sides[side].players;
  if (playerId) {
    const player = players.find((p) => p.id === playerId);
    if (player) return player.jersey ? `#${player.jersey} ${player.name}` : player.name;
  }
  if (match.format === "singles" && players.length === 1) return players[0].name;
  return undefined;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** Renders the commentary text for a single point. */
export function describePoint(match: Match, event: ScoreEvent): string {
  const side = event.side;
  const opp = other(side);
  const sideName = match.sides[side].name;
  const oppName = match.sides[opp].name;

  if (event.action) {
    const isError = event.action.credit === "error";
    const scorer = isError ? playerName(match, side) : playerName(match, side, event.actorId);
    const opponent = isError ? playerName(match, opp, event.actorId) : playerName(match, opp);
    return fillTemplate(event.action.template, {
      player: scorer ?? sideName,
      side: sideName,
      opponent: opponent ?? oppName,
      opponentSide: oppName,
    });
  }

  const scorer = playerName(match, side, event.actorId);
  if (scorer && match.format !== "singles") return `${scorer} scores a point for ${sideName}`;
  return `Point to ${scorer ?? sideName}`;
}

function setScores(state: MatchState, upToSet: number): string {
  return state.sets
    .slice(0, upToSet + 1)
    .filter((s) => s.winner)
    .map((s) => `${s.A}–${s.B}`)
    .join(", ");
}

/** Builds the full commentary feed (oldest first) from the derived match state. */
export function buildCommentary(match: Match, state: MatchState): CommentaryLine[] {
  const sport = SPORTS[match.sport];
  const lines: CommentaryLine[] = [];
  const nameOf = (side: SideKey) => match.sides[side].name;

  if (match.startedAt) {
    lines.push({
      id: "start",
      kind: "system",
      text: `Match started: ${nameOf("A")} vs ${nameOf("B")}`,
      at: match.startedAt,
      set: 1,
    });
  }

  let prevSetPoint: SideKey | null = null;
  let prevMatchPoint: SideKey | null = null;

  for (const p of state.points) {
    if (p.ignored) continue;
    const setNo = p.setIndex + 1;
    const at = p.event.createdAt;
    const text = describePoint(match, p.event) + (p.event.note ? `. ${p.event.note}` : "");
    lines.push({
      id: p.event.id,
      kind: "point",
      text,
      at,
      set: setNo,
      score: `${p.score.A}–${p.score.B}`,
      side: p.event.side,
    });

    if (p.matchWon) {
      lines.push({
        id: `${p.event.id}-match`,
        kind: "system",
        text: `${nameOf(p.matchWon)} wins the match ${p.setsWon[p.matchWon]}–${p.setsWon[other(p.matchWon)]} (${setScores(state, p.setIndex)})`,
        at,
        set: setNo,
        highlight: true,
      });
    } else if (p.setWon) {
      lines.push({
        id: `${p.event.id}-set`,
        kind: "system",
        text: `${sport.setLabel} ${setNo} to ${nameOf(p.setWon)}, ${p.score[p.setWon]}–${p.score[other(p.setWon)]}. ${sport.setLabel}s: ${p.setsWon.A}–${p.setsWon.B}`,
        at,
        set: setNo,
        highlight: true,
      });
    } else if (p.matchPoint && p.matchPoint !== prevMatchPoint) {
      lines.push({ id: `${p.event.id}-mp`, kind: "system", text: `Match point, ${nameOf(p.matchPoint)}!`, at, set: setNo });
    } else if (p.setPoint && p.setPoint !== prevSetPoint) {
      lines.push({
        id: `${p.event.id}-sp`,
        kind: "system",
        text: `${sport.setLabel} point, ${nameOf(p.setPoint)}`,
        at,
        set: setNo,
      });
    }
    prevSetPoint = p.setPoint;
    prevMatchPoint = p.matchPoint;
  }

  // Rule changes are announced just before the first point recorded after them.
  for (const change of match.ruleChanges ?? []) {
    const line: CommentaryLine = {
      id: `rules-${change.id}`,
      kind: "system",
      text: `Rules changed from ${sport.setLabel} ${change.fromSet + 1}: ${describeRules(change.rules, sport.setLabel)}`,
      at: change.at,
      set: change.fromSet + 1,
    };
    const index = lines.findIndex((l) => l.kind === "point" && l.at > change.at);
    if (index < 0) lines.push(line);
    else lines.splice(index, 0, line);
  }

  if (match.status === "closed" && match.closedAt) {
    lines.push({
      id: "closed",
      kind: "system",
      text: match.outcome
        ? `${describeOutcome(match, match.outcome)}.`
        : state.winner
          ? "Match closed. Result confirmed."
          : "Match closed without a result.",
      highlight: !!match.outcome,
      at: match.closedAt,
      set: state.currentSet + 1,
    });
  }

  return lines;
}
