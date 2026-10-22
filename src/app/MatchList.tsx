"use client";

import Link from "next/link";
import { Scoreboard, matchSubtitle } from "@/components/match-ui";
import { demoMatches } from "@/lib/demo";
import { matchState } from "@/lib/rally/engine";
import type { Match, MatchStatus } from "@/lib/rally/types";
import { FORMAT_LABELS, SPORTS } from "@/lib/rally/sports";
import { tieState } from "@/lib/tie/tie";
import type { Tie } from "@/lib/tie/types";
import { champion, type Data } from "@/lib/tournament/engine";
import type { Tournament } from "@/lib/tournament/types";
import { saveMatch, setUser, useMatches, useTies, useTournaments, useUser } from "@/lib/store";

const GROUPS: { status: MatchStatus; title: string }[] = [
  { status: "live", title: "Live now" },
  { status: "scheduled", title: "Upcoming" },
  { status: "closed", title: "Results" },
];

function MatchCard({ match }: { match: Match }) {
  const state = matchState(match);
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

const PHASE_TEXT: Record<Tournament["phase"], string> = {
  setup: "Setting up",
  groups: "Group stage",
  knockout: "Knockout",
  complete: "Finished",
};

function TournamentCard({ t, data }: { t: Tournament; data: Data }) {
  const winner = champion(t, data);
  const live = Object.values(data.matches).filter(
    (m) => m.status === "live" && (m.tournament?.id === t.id || (m.tie && data.ties[m.tie.id]?.tournament?.id === t.id)),
  ).length;
  return (
    <li>
      <Link href={`/tournaments/${t.id}`} className="block rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs text-muted">
          {SPORTS[t.sport].name} · {FORMAT_LABELS[t.format]} · {t.entries.length} entries
        </p>
        <p className="mt-0.5 font-semibold">{t.name}</p>
        <p className="mt-1 text-sm">
          {winner ? (
            <span className="font-semibold text-accent">🏆 {t.entries.find((e) => e.id === winner)?.name}</span>
          ) : (
            <span className="text-muted">{PHASE_TEXT[t.phase]}</span>
          )}
          {live > 0 && <span className="ml-2 font-semibold text-live">● {live} live</span>}
        </p>
      </Link>
    </li>
  );
}

function TieCard({ tie, data }: { tie: Tie; data: Data }) {
  const state = tieState(tie, data.matches);
  return (
    <li>
      <Link href={`/ties/${tie.id}`} className="block rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs text-muted">
          {SPORTS[tie.sport].name} · Team tie · best of {tie.matchCount}
          {state.live && <span className="ml-2 font-semibold text-live">● Live</span>}
        </p>
        {(["A", "B"] as const).map((side) => (
          <p key={side} className={`flex justify-between ${state.winner === side ? "font-bold" : "font-medium"}`}>
            <span className="truncate">{tie.teams[side].name}</span>
            <span className="tabular">{state.score[side]}</span>
          </p>
        ))}
      </Link>
    </li>
  );
}

export function MatchList() {
  const matches = useMatches();
  const tournaments = useTournaments();
  const ties = useTies();
  const user = useUser();
  if (matches === null || tournaments === null || ties === null) return <p className="py-10 text-center text-muted">Loading…</p>;
  const data = { matches, ties };
  // Matches inside a team tie are shown on the tie's page.
  const all = Object.values(matches)
    .filter((m) => !m.tie)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tournamentList = Object.values(tournaments).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tieList = Object.values(ties)
    .filter((x) => !x.tournament)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Link href="/tournaments/new" className="rounded-xl bg-foreground px-4 py-3 text-center text-sm font-semibold text-background">
          + New tournament
        </Link>
        <Link href="/matches/new" className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold">
          + Single match
        </Link>
        <Link href="/ties/new" className="col-span-2 rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold">
          + Team tie (badminton / table tennis)
        </Link>
      </div>

      {tournamentList.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Tournaments</h2>
          <ul className="space-y-3">
            {tournamentList.map((t) => (
              <TournamentCard key={t.id} t={t} data={data} />
            ))}
          </ul>
        </section>
      )}

      {tieList.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Team ties</h2>
          <ul className="space-y-3">
            {tieList.map((x) => (
              <TieCard key={x.id} tie={x} data={data} />
            ))}
          </ul>
        </section>
      )}

      {all.length === 0 && tournamentList.length === 0 && tieList.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No matches yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a badminton, table tennis or volleyball match, or load samples to explore
            {user ? "" : " (you'll be signed in as @organiser)"}.
          </p>
          <button
            type="button"
            onClick={() => {
              const organiser = user ?? "@organiser";
              if (!user) setUser(organiser);
              demoMatches(organiser).forEach(saveMatch);
            }}
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
