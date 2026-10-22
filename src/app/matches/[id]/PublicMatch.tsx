"use client";

import Link from "next/link";
import { use } from "react";
import { CommentaryFeed, MatchGate, Scoreboard, matchSubtitle, useMatchView } from "@/components/match-ui";
import { hasScoringAccess, isCorrected, isOrganiser } from "@/lib/rally/mutations";
import { describeRules } from "@/lib/rally/rules";
import { SPORTS } from "@/lib/rally/sports";
import { useUser } from "@/lib/store";

/** Spectator view: read-only, updates live as the scorer records points. */
export function PublicMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { match, state, commentary } = useMatchView(id);
  const user = useUser();

  return (
    <MatchGate match={match}>
      {(m) => (
        <div className="space-y-4 pb-8">
          <div>
            {m.tournament && (
              <Link href={`/tournaments/${m.tournament.id}`} className="text-sm font-medium text-side-a">
                ← Tournament · {m.tournament.label}
              </Link>
            )}
            {m.tie && (
              <Link href={`/ties/${m.tie.id}`} className="text-sm font-medium text-side-a">
                ← Team tie · {m.tie.teams.A} vs {m.tie.teams.B} · Match {m.tie.index + 1}
              </Link>
            )}
            <p className="text-sm text-muted">{matchSubtitle(m)}</p>
            <h1 className="text-xl font-bold">
              {m.sides.A.name} <span className="font-normal text-muted">vs</span> {m.sides.B.name}
            </h1>
          </div>

          <Scoreboard match={m} state={state!} />
          <p className="-mt-2 text-xs text-muted">Rules: {describeRules(state!.rules, SPORTS[m.sport].setLabel)}</p>

          {m.status === "closed" && isCorrected(m) && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Result corrected by the organiser after the match.</p>
          )}

          <div className="flex gap-2">
            {m.livestreamUrl && (
              <a
                href={m.livestreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl bg-live py-3 text-center font-semibold text-white"
              >
                ▶ Watch live
              </a>
            )}
            {m.status !== "closed" && hasScoringAccess(m, user) && (
              <Link href={`/matches/${m.id}/score`} className="flex-1 rounded-xl border border-border bg-surface py-3 text-center font-medium">
                Score this match
              </Link>
            )}
            {m.status === "closed" && isOrganiser(m, user) && (
              <Link href={`/matches/${m.id}/edit`} className="flex-1 rounded-xl border border-border bg-surface py-3 text-center text-sm font-medium">
                Edit points
              </Link>
            )}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Live commentary</h2>
            <CommentaryFeed match={m} lines={commentary} />
          </section>
        </div>
      )}
    </MatchGate>
  );
}
