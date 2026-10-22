"use client";

import Link from "next/link";
import { ScoreCard } from "@/components/cards/ScoreCard";
import type { MatchState } from "@/lib/rally/engine";
import { describeOutcome } from "@/lib/rally/outcome";
import { SPORTS } from "@/lib/rally/sports";
import type { Match } from "@/lib/rally/types";

/** Shown once a match is closed: who won, the score card, and where to go next. */
export function MatchSummary({ match, state }: { match: Match; state: MatchState }) {
  const winner = state.winner;
  const sport = SPORTS[match.sport];
  const sets = state.sets.filter((s) => s.winner);
  const loser = winner === "A" ? "B" : "A";
  const scoreLine = winner
    ? `${state.setsWon[winner]}–${state.setsWon[loser]} in ${sport.setLabel.toLowerCase()}s${
        sets.length ? ` (${sets.map((s) => `${s[winner]}–${s[loser]}`).join(", ")})` : ""
      }`
    : "";
  const cards = winner ? match.sides[winner].players.filter((p) => p.cardId) : [];

  return (
    <section className="space-y-3">
      {winner ? (
        <div className="rounded-2xl border-2 border-accent bg-accent/10 p-5 text-center">
          <p className="text-4xl" aria-hidden>
            🏆
          </p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-accent">Congratulations</p>
          <p className="text-2xl font-black">
            {match.sides[winner].name} <span className="text-accent">✓</span>
          </p>
          <p className="mt-1 text-sm">{match.outcome ? describeOutcome(match, match.outcome) : `won ${scoreLine}`}</p>
          {match.outcome && scoreLine && <p className="text-xs text-muted">{scoreLine}</p>}
          {cards.length > 0 && (
            <p className="mt-2 text-sm">
              {cards.map((p) => (
                <Link key={p.cardId} href={`/players/${p.cardId}`} className="mx-1 font-medium text-accent underline">
                  🪪 {p.name}&rsquo;s card
                </Link>
              ))}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="font-semibold">No result</p>
          <p className="text-sm text-muted">The match ended without a winner.</p>
        </div>
      )}
      <ScoreCard match={match} />
      <div className="flex gap-2">
        {match.tournament ? (
          <Link href={`/tournaments/${match.tournament.id}`} className="flex-1 rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium">
            Back to tournament
          </Link>
        ) : match.tie ? (
          <Link href={`/ties/${match.tie.id}`} className="flex-1 rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium">
            Back to the tie
          </Link>
        ) : (
          <Link href="/matches/new" className="flex-1 rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium">
            Start another match
          </Link>
        )}
      </div>
    </section>
  );
}
