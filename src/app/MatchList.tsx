"use client";

import Link from "next/link";
import { Scoreboard, matchSubtitle } from "@/components/match-ui";
import { demoMatches } from "@/lib/demo";
import { computeState } from "@/lib/rally/engine";
import type { Match, MatchStatus } from "@/lib/rally/types";
import { saveMatch, useMatches } from "@/lib/store";

const GROUPS: { status: MatchStatus; title: string }[] = [
  { status: "live", title: "Live now" },
  { status: "scheduled", title: "Upcoming" },
  { status: "closed", title: "Results" },
];

function MatchCard({ match }: { match: Match }) {
  const state = computeState(match.events, match.rules);
  return (
    <li className="space-y-2">
      <Link href={`/matches/${match.id}`} className="block">
        <p className="mb-1.5 truncate text-xs text-muted">{matchSubtitle(match)}</p>
        <Scoreboard match={match} state={state} compact />
      </Link>
      {match.status !== "closed" && (
        <Link
          href={`/matches/${match.id}/score`}
          className="block rounded-lg border border-border bg-surface py-2 text-center text-sm font-medium"
        >
          {match.status === "scheduled" ? "Open scorer to start" : "Open scorer"}
        </Link>
      )}
    </li>
  );
}

export function MatchList() {
  const matches = useMatches();
  if (matches === null) return <p className="py-10 text-center text-muted">Loading…</p>;
  const all = Object.values(matches).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Matches</h1>
        <Link href="/matches/new" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">
          + New match
        </Link>
      </div>

      {all.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No matches yet</p>
          <p className="mt-1 text-sm text-muted">Create a badminton, table tennis or volleyball match, or load samples to explore.</p>
          <button
            type="button"
            onClick={() => demoMatches().forEach(saveMatch)}
            className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium"
          >
            Load sample matches
          </button>
        </div>
      )}

      {GROUPS.map(({ status, title }) => {
        const list = all.filter((m) => m.status === status);
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
            <ul className="space-y-5">
              {list.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="text-xs text-muted">
        Prototype: matches are saved in this browser only. Open a match in two tabs to see live updates between the scorer and public view.
      </p>
    </div>
  );
}
