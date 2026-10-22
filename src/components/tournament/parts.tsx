"use client";

import Link from "next/link";
import { sideBg } from "@/components/match-ui";
import { matchState } from "@/lib/rally/engine";
import { SPORTS } from "@/lib/rally/sports";
import type { Match } from "@/lib/rally/types";
import {
  fixtureWinner,
  isByeFixture,
  matchResult,
  resolveSides,
  roundName,
  standings,
  type Matches,
} from "@/lib/tournament/engine";
import type { Fixture, Group, Tournament } from "@/lib/tournament/types";

export const entryName = (t: Tournament, id?: string) => (id ? (t.entries.find((e) => e.id === id)?.name ?? "?") : undefined);

/** Points table for one group; the qualifying places are highlighted. */
export function PointsTable({
  t,
  group,
  matches,
  qualify,
}: {
  t: Tournament;
  group: Group;
  matches: Matches;
  qualify: number;
}) {
  const rows = standings(group, t.fixtures, matches, t.points);
  const setLabel = SPORTS[t.sport].setLabel;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between bg-surface-2 px-4 py-2">
        <h3 className="font-semibold">{group.name}</h3>
        {qualify > 0 && <span className="text-xs text-muted">Top {qualify} qualify</span>}
      </div>
      <table className="tabular w-full text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="w-8 py-2 pl-4 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Team</th>
            <th className="w-8 font-medium" title="Played">P</th>
            <th className="w-8 font-medium" title="Won">W</th>
            <th className="w-8 font-medium" title="Lost">L</th>
            <th className="w-12 font-medium" title={`${setLabel}s won – lost`}>
              {setLabel.slice(0, 1)}D
            </th>
            <th className="w-12 pr-4 text-right font-medium" title="Points">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entryId} className={`border-t border-border ${i < qualify ? "bg-accent/10" : ""}`}>
              <td className="py-2 pl-4 text-muted">{i + 1}</td>
              <td className="truncate py-2 font-medium">{entryName(t, r.entryId)}</td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.won}</td>
              <td className="text-center">{r.lost}</td>
              <td className="text-center">{signed(r.setsFor - r.setsAgainst)}</td>
              <td className="pr-4 text-right font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

function statusText(match: Match | undefined) {
  if (!match) return "Waiting";
  if (match.status === "scheduled") return "Upcoming";
  if (match.status === "live") return "Live";
  return "Final";
}

/** One fixture: both sides, status and score, linking to the match when it exists. */
export function FixtureCard({ t, fixture, matches, compact = false }: { t: Tournament; fixture: Fixture; matches: Matches; compact?: boolean }) {
  const match = fixture.matchId ? matches[fixture.matchId] : undefined;
  const sides = resolveSides(fixture, t.fixtures, matches);
  const winner = fixtureWinner(fixture, t.fixtures, matches);
  const bye = isByeFixture(fixture);
  const state = match ? matchState(match) : null;
  const result = match ? matchResult(match) : null;
  const live = match?.status === "live";

  const placeholder = (side: "a" | "b") => {
    const source = fixture[side];
    if (source.type === "bye") return "Bye";
    if (source.type === "winner") {
      const from = t.fixtures.find((f) => f.id === source.fixtureId);
      if (!from) return "TBD";
      const total = Math.max(...t.fixtures.filter((f) => f.stage === "knockout").map((f) => f.round));
      const inRound = t.fixtures.filter((f) => f.stage === "knockout" && f.round === from.round).length;
      return `Winner ${roundName(from.round, total)}${inRound > 1 ? ` ${from.index + 1}` : ""}`;
    }
    return "TBD";
  };

  const row = (side: "a" | "b", matchSide: "A" | "B") => {
    const id = sides[side];
    const isWinner = !!winner && winner === id;
    return (
      <div className={`flex items-center gap-2 ${isWinner ? "font-bold" : ""} ${id ? "" : "text-muted"}`}>
        <span className={`h-4 w-1 shrink-0 rounded-full ${id ? sideBg[matchSide] : "bg-border"}`} />
        <span className="min-w-0 flex-1 truncate">{entryName(t, id) ?? placeholder(side)}</span>
        {result && match?.status !== "scheduled" && <span className="tabular w-5 text-right">{result.sets[matchSide]}</span>}
        {live && state && !state.winner && (
          <span className="tabular w-7 text-right text-xs font-semibold text-live">{state.sets[state.currentSet][matchSide]}</span>
        )}
      </div>
    );
  };

  const body = (
    <div className={`space-y-1 rounded-xl border border-border bg-surface ${compact ? "p-2 text-sm" : "p-3"}`}>
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{match?.tournament?.label ?? (bye ? "Bye" : "")}</span>
          <span className={live ? "font-semibold text-live" : ""}>{bye ? "Advances" : statusText(match)}</span>
        </div>
      )}
      {row("a", "A")}
      {row("b", "B")}
    </div>
  );
  return match ? (
    <Link href={`/matches/${match.id}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Knockout bracket: one column per round, scrolls sideways on phones. */
export function Bracket({ t, matches }: { t: Tournament; matches: Matches }) {
  const knockout = t.fixtures.filter((f) => f.stage === "knockout");
  if (knockout.length === 0) return null;
  const total = Math.max(...knockout.map((f) => f.round));
  const rounds = Array.from({ length: total }, (_, i) => knockout.filter((f) => f.round === i + 1).sort((a, b) => a.index - b.index));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-3">
        {rounds.map((fixtures, i) => (
          <div key={i} className="flex w-52 flex-col">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{roundName(i + 1, total)}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {fixtures.map((f) => (
                <FixtureCard key={f.id} t={t} fixture={f} matches={matches} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
