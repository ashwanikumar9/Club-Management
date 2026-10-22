"use client";

import Link from "next/link";
import { sideBg } from "@/components/match-ui";
import { matchState } from "@/lib/rally/engine";
import { SPORTS } from "@/lib/rally/sports";
import {
  fixtureOutcome,
  fixtureWinner,
  isByeFixture,
  resolveSides,
  roundName,
  tableFor,
  type Data,
} from "@/lib/tournament/engine";
import { fixtureLabel } from "@/lib/tournament/mutations";
import { formatSchedule } from "@/lib/tournament/schedule";
import { RANKINGS } from "@/lib/tournament/ranking";
import type { Fixture, Group, Tournament } from "@/lib/tournament/types";

export const entryName = (t: Tournament, id?: string) => (id ? (t.entries.find((e) => e.id === id)?.name ?? "?") : undefined);

/** Points table for one group; the qualifying places are highlighted. */
export function PointsTable({
  t,
  group,
  data,
  qualify,
}: {
  t: Tournament;
  group: Group;
  data: Data;
  qualify: number;
}) {
  const rows = tableFor(t, group, data);
  const ranking = RANKINGS[t.ranking ?? "custom"];
  const showPoints = ranking.key !== "bwf"; // BWF ranks on wins alone
  const ties = !!t.tieMatchCount;
  const setLabel = ties ? "Match" : SPORTS[t.sport].setLabel;
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
            <th className="w-12 font-medium" title={ties ? "Matches won – lost" : `${setLabel}s won – lost`}>
              {ties ? "MD" : `${setLabel.slice(0, 1)}D`}
            </th>
            {showPoints && (
              <th className="w-12 pr-4 text-right font-medium" title="Points">
                Pts
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.entryId} className={`border-t border-border ${i < qualify && !r.withdrawn ? "bg-accent/10" : ""} ${r.withdrawn ? "text-muted" : ""}`}>
              <td className="py-2 pl-4 text-muted">{i + 1}</td>
              <td className="truncate py-2 font-medium">
                {entryName(t, r.entryId)}
                {r.withdrawn && <span className="block text-xs font-normal">Withdrew: results deleted</span>}
              </td>
              <td className="text-center">{r.played}</td>
              <td className="text-center">{r.won}</td>
              <td className="text-center">{r.lost}</td>
              <td className="text-center">{signed(r.setsFor - r.setsAgainst)}</td>
              {showPoints && <td className="pr-4 text-right font-bold">{r.points}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2 text-xs text-muted">
        {ranking.label}: {ranking.order}
      </p>
    </div>
  );
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

const STATUS_TEXT = { none: "Waiting", scheduled: "Upcoming", live: "Live", closed: "Final" } as const;

/** One fixture: both sides, status and score, linking to the match or tie when it exists. */
export function FixtureCard({
  t,
  fixture,
  data,
  compact = false,
  showSchedule = true,
}: {
  t: Tournament;
  fixture: Fixture;
  data: Data;
  compact?: boolean;
  /** Off where the time is already shown next to the card (the Schedule tab). */
  showSchedule?: boolean;
}) {
  const match = fixture.matchId ? data.matches[fixture.matchId] : undefined;
  const tie = fixture.tieId ? data.ties[fixture.tieId] : undefined;
  const sides = resolveSides(fixture, t.fixtures, data);
  const winner = fixtureWinner(fixture, t.fixtures, data);
  const outcome = fixtureOutcome(fixture, data);
  const bye = isByeFixture(fixture);
  const state = match ? matchState(match) : null;
  const live = outcome.status === "live";
  const href = match ? `/matches/${match.id}` : tie ? `/ties/${tie.id}` : undefined;

  const placeholder = (side: "a" | "b") => {
    const source = fixture[side];
    if (source.type === "bye") return "Bye";
    if (source.type === "winner" || source.type === "loser") {
      const from = t.fixtures.find((f) => f.id === source.fixtureId);
      if (!from) return "TBD";
      return `${source.type === "winner" ? "Winner" : "Loser"} ${fixtureLabel(t, from)}`;
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
        {outcome.status !== "none" && outcome.status !== "scheduled" && (
          <span className="tabular w-5 text-right">{outcome.score[matchSide]}</span>
        )}
        {live && state && !state.winner && (
          <span className="tabular w-7 text-right text-xs font-semibold text-live">{state.sets[state.currentSet][matchSide]}</span>
        )}
      </div>
    );
  };

  const label = bye ? "Bye" : fixtureLabel(t, fixture);
  const body = (
    <div className={`space-y-1 rounded-xl border border-border bg-surface ${compact ? "p-2 text-sm" : "p-3"}`}>
      {(!compact || fixture.third) && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span className="min-w-0 truncate">
            {label}
            {tie && !compact ? ` · team tie, best of ${tie.matchCount}` : ""}
            {!compact && showSchedule && fixture.schedule ? ` · ${formatSchedule(fixture.schedule)}` : ""}
          </span>
          {!compact && <span className={live ? "font-semibold text-live" : ""}>{bye ? "Advances" : STATUS_TEXT[outcome.status]}</span>}
        </div>
      )}
      {row("a", "A")}
      {row("b", "B")}
      {compact && showSchedule && fixture.schedule && <div className="tabular truncate pt-0.5 text-[11px] text-muted">{formatSchedule(fixture.schedule)}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Knockout bracket: one column per round, scrolls sideways on phones. */
export function Bracket({ t, data, stageId }: { t: Tournament; data: Data; stageId?: string }) {
  const knockout = t.fixtures.filter((f) => f.stage === "knockout" && f.stageId === stageId);
  if (knockout.length === 0) return null;
  const total = Math.max(...knockout.map((f) => f.round));
  // The third-place match sits under the final.
  const rounds = Array.from({ length: total }, (_, i) =>
    knockout.filter((f) => f.round === i + 1).sort((a, b) => Number(!!a.third) - Number(!!b.third) || a.index - b.index),
  );
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-3">
        {rounds.map((fixtures, i) => (
          <div key={i} className="flex w-[10.5rem] flex-col sm:w-52">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{roundName(i + 1, total)}</h3>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {fixtures.map((f) => (
                <FixtureCard key={f.id} t={t} fixture={f} data={data} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
