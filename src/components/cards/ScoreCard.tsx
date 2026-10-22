"use client";

import Link from "next/link";
import { StatusBadge, sideBg, sideText } from "@/components/match-ui";
import { matchState } from "@/lib/rally/engine";
import { describeOutcome } from "@/lib/rally/outcome";
import { SPORTS } from "@/lib/rally/sports";
import type { Match, SideKey } from "@/lib/rally/types";
import { formatSchedule } from "@/lib/tournament/schedule";

/**
 * The one compact card for a match, the same in every sport and on every page: home, tournaments, ties and
 * player profiles. `highlight` marks the side of the player whose profile is shown.
 */
export function ScoreCard({ match, highlight, href }: { match: Match; highlight?: SideKey | null; href?: string }) {
  const state = matchState(match);
  const sport = SPORTS[match.sport];
  const label = match.tie ? `${match.tie.teams.A} v ${match.tie.teams.B}` : (match.tournament?.label ?? match.title);
  const finished = state.sets.filter((s) => s.winner);
  const current = state.sets[state.currentSet];
  const live = match.status === "live" && !state.winner;
  const note =
    match.status === "scheduled"
      ? match.schedule && formatSchedule(match.schedule)
      : match.status === "closed" && match.outcome
        ? describeOutcome(match, match.outcome)
        : null;

  return (
    <Link href={href ?? `/matches/${match.id}`} className="block rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate">{[sport.name, label].filter(Boolean).join(" · ")}</span>
        <StatusBadge match={match} state={state} />
      </div>
      {(["A", "B"] as const).map((side) => (
        <div key={side} className="flex items-center gap-2 py-0.5">
          <span className={`h-5 w-1 shrink-0 rounded-full ${sideBg[side]}`} />
          <span className={`min-w-0 flex-1 truncate ${state.winner === side ? "font-bold" : "font-medium"}`}>
            {match.sides[side].name}
            {highlight === side && <span className="ml-1.5 rounded bg-accent/15 px-1 text-[10px] font-semibold uppercase text-accent">Player</span>}
            {live && state.server === side && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" title="Serving" />}
          </span>
          <span className="tabular flex gap-2 text-sm text-muted">
            {finished.map((s, i) => (
              <span key={i} className={s.winner === side ? "font-semibold text-foreground" : ""}>
                {s[side]}
              </span>
            ))}
          </span>
          {live && <span className={`tabular w-7 text-right text-lg font-bold ${sideText[side]}`}>{current[side]}</span>}
        </div>
      ))}
      {note && <p className="mt-1.5 truncate text-xs text-muted">{note}</p>}
    </Link>
  );
}
