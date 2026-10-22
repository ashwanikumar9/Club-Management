"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { buildCommentary, type CommentaryLine } from "@/lib/rally/commentary";
import { computeState, type MatchState } from "@/lib/rally/engine";
import { FORMAT_LABELS, SPORTS } from "@/lib/rally/sports";
import type { Match, SideKey } from "@/lib/rally/types";
import { useMatch } from "@/lib/store";

export const sideText: Record<SideKey, string> = { A: "text-side-a", B: "text-side-b" };
export const sideBg: Record<SideKey, string> = { A: "bg-side-a", B: "bg-side-b" };
export const sideSoft: Record<SideKey, string> = { A: "bg-side-a-soft", B: "bg-side-b-soft" };

export function useMatchView(id: string) {
  const match = useMatch(id);
  const state = useMemo(() => (match ? computeState(match.events, match.rules) : null), [match]);
  const commentary = useMemo(() => (match && state ? buildCommentary(match, state) : []), [match, state]);
  return { match, state, commentary };
}

/** Renders loading / not-found states so pages only deal with a real match. */
export function MatchGate({
  match,
  children,
}: {
  match: Match | null | undefined;
  children: (match: Match) => ReactNode;
}) {
  if (match === undefined) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (match === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This match does not exist on this device.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-side-a underline">
          Back to matches
        </Link>
      </div>
    );
  return <>{children(match)}</>;
}

export function StatusBadge({ match, state }: { match: Match; state: MatchState }) {
  if (match.status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5 text-xs font-semibold text-live">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" /> {state.winner ? "Awaiting close" : "Live"}
      </span>
    );
  if (match.status === "closed")
    return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">Final</span>;
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">Upcoming</span>;
}

export function matchSubtitle(match: Match) {
  const sport = SPORTS[match.sport];
  return [sport.name, FORMAT_LABELS[match.format], match.title, match.venue].filter(Boolean).join(" · ");
}

export function sidePlayers(match: Match, side: SideKey) {
  const s = match.sides[side];
  if (match.format === "singles" || s.players.length === 0) return null;
  return s.players.map((p) => (p.jersey ? `#${p.jersey} ${p.name}` : p.name)).join(", ");
}

/** Big scoreboard: current set score, sets won and set-by-set breakdown. */
export function Scoreboard({ match, state, compact = false }: { match: Match; state: MatchState; compact?: boolean }) {
  const sport = SPORTS[match.sport];
  const current = state.sets[state.currentSet];
  const finishedSets = state.sets.filter((s) => s.winner);
  const showCurrent = !state.winner;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between text-xs text-muted">
        <span>
          {state.winner
            ? `${sport.setLabel}s ${state.setsWon.A}–${state.setsWon.B}`
            : `${sport.setLabel} ${state.currentSet + 1} of ${match.rules.bestOf}`}
        </span>
        <StatusBadge match={match} state={state} />
      </div>
      {(["A", "B"] as const).map((side) => {
        const isWinner = state.winner === side;
        const players = sidePlayers(match, side);
        return (
          <div key={side} className="flex items-center gap-3 py-1.5">
            <span className={`h-8 w-1.5 shrink-0 rounded-full ${sideBg[side]}`} />
            <div className="min-w-0 flex-1">
              <div className={`truncate font-semibold ${compact ? "text-base" : "text-lg"}`}>
                {match.sides[side].name} {isWinner && <span className="text-accent">✓</span>}
              </div>
              {players && !compact && <div className="truncate text-xs text-muted">{players}</div>}
            </div>
            <div className="tabular flex items-center gap-1.5 text-sm text-muted">
              {finishedSets.map((s, i) => (
                <span key={i} className={`w-7 text-center ${s.winner === side ? "font-bold text-foreground" : ""}`}>
                  {s[side]}
                </span>
              ))}
            </div>
            <div
              className={`tabular w-10 text-center text-xs font-semibold text-muted`}
              title={`${sport.setLabel}s won`}
            >
              {state.setsWon[side]}
            </div>
            {showCurrent && (
              <div className={`tabular w-14 text-right font-bold ${compact ? "text-3xl" : "text-4xl"} ${sideText[side]}`}>
                {current[side]}
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-1 flex justify-end gap-1.5 text-[10px] uppercase tracking-wide text-muted">
        {finishedSets.length > 0 && <span className="mr-auto">{sport.setLabel} scores</span>}
        <span className="w-10 text-center">{sport.setLabel}s</span>
        {showCurrent && <span className="w-14 text-right">Now</span>}
      </div>
      {state.matchPoint && !state.winner ? (
        <p className={`mt-2 text-center text-sm font-semibold ${sideText[state.matchPoint]}`}>
          Match point · {match.sides[state.matchPoint].name}
        </p>
      ) : state.setPoint && !state.winner ? (
        <p className={`mt-2 text-center text-sm font-semibold ${sideText[state.setPoint]}`}>
          {sport.setLabel} point · {match.sides[state.setPoint].name}
        </p>
      ) : null}
    </div>
  );
}

function time(at: string) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Live commentary, newest first, grouped by set. */
export function CommentaryFeed({ match, lines, limit }: { match: Match; lines: CommentaryLine[]; limit?: number }) {
  const sport = SPORTS[match.sport];
  const ordered = [...lines].reverse().slice(0, limit);
  if (ordered.length === 0) return <p className="py-6 text-center text-sm text-muted">Commentary will appear once the match starts.</p>;

  return (
    <ol className="space-y-1">
      {ordered.map((line, i) => {
        const header = i === 0 || ordered[i - 1].set !== line.set;
        return (
          <li key={line.id}>
            {header && (
              <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">
                {sport.setLabel} {line.set}
              </div>
            )}
            <div
              className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm ${
                line.highlight ? "bg-accent/10 font-semibold" : line.kind === "system" ? "bg-surface-2" : "bg-surface"
              }`}
            >
              {line.side ? (
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sideBg[line.side]}`} />
              ) : (
                <span className="mt-1.5 h-2 w-2 shrink-0" />
              )}
              <span className="flex-1">{line.text}</span>
              {line.score && <span className="tabular shrink-0 font-semibold">{line.score}</span>}
              <span className="tabular w-11 shrink-0 text-right text-xs text-muted">{time(line.at)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
