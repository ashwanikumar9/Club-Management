"use client";

import Link from "next/link";
import { use, useState } from "react";
import { EditCard } from "@/components/cards/EditCard";
import { PlayerCardView } from "@/components/cards/PlayerCardView";
import { ScoreCard } from "@/components/cards/ScoreCard";
import { canEditCard, ownsCard } from "@/lib/players/cards";
import { playerStats, type Appearance } from "@/lib/players/stats";
import { SPORTS } from "@/lib/rally/sports";
import { useMatches, usePlayer, usePlayerContacts, useTies, useTournaments, useUser } from "@/lib/store";

const MEDAL = { 1: "🥇 Champion", 2: "🥈 Runner-up", 3: "🥉 Third" } as const;

export function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const card = usePlayer(id);
  const matches = useMatches();
  const ties = useTies();
  const tournaments = useTournaments();
  const contacts = usePlayerContacts();
  const user = useUser();
  const [editing, setEditing] = useState(false);

  if (card === undefined || !matches || !ties || !tournaments) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (card === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This player card does not exist.</p>
        <Link href="/players" className="mt-3 inline-block font-medium text-side-a underline">
          All players
        </Link>
      </div>
    );

  const stats = playerStats(card.id, { matches, ties }, Object.values(tournaments));
  const editable = canEditCard(card, contacts, user);
  const mine = ownsCard(card, contacts, user);

  return (
    <div className="space-y-5 pb-10">
      <Link href="/players" className="text-sm font-medium text-side-a">
        ← Players
      </Link>
      <PlayerCardView card={card} stats={stats} mine={mine} />
      {editable && (
        <button type="button" onClick={() => setEditing(true)} className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold">
          {mine ? "Edit my profile" : "Edit card"}
        </button>
      )}

      <Matches title="Playing now" list={stats.live} />
      <Matches title="Upcoming" list={stats.upcoming} />

      {stats.bySport.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">By sport</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="tabular w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pl-4 text-left font-medium">Sport</th>
                  <th className="font-medium">P</th>
                  <th className="font-medium">W–L</th>
                  <th className="font-medium">Games</th>
                  <th className="pr-4 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {stats.bySport.map((s) => (
                  <tr key={s.sport} className="border-t border-border">
                    <td className="py-2 pl-4 font-medium">{SPORTS[s.sport].name}</td>
                    <td className="text-center">{s.played}</td>
                    <td className="text-center">
                      {s.won}–{s.lost}
                    </td>
                    <td className="text-center">
                      {s.gamesWon}–{s.gamesLost}
                    </td>
                    <td className="pr-4 text-right">
                      {s.pointsWon}–{s.pointsLost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stats.medals.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Medals</h2>
          <ul className="space-y-2">
            {stats.medals.map((m) => (
              <li key={m.tournament.id}>
                <Link href={`/tournaments/${m.tournament.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                  <span className="font-medium">{m.tournament.name}</span>
                  <span className="text-sm">{MEDAL[m.place]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.topShots.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Winning shots</h2>
          <ul className="flex flex-wrap gap-2">
            {stats.topShots.map((s) => (
              <li key={s.label} className="rounded-full bg-surface-2 px-3 py-1 text-sm">
                {s.label} <span className="font-semibold">×{s.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.teams.length > 0 && <p className="text-sm text-muted">Teams and pairs: {stats.teams.join(", ")}</p>}

      <Matches title="Results" list={stats.results} />
      {stats.results.length + stats.upcoming.length + stats.live.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          No matches yet. Pick this card when adding {card.name} to a match, tie or tournament.
        </p>
      )}

      {editing && <EditCard card={card} mine={mine} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Matches({ title, list }: { title: string; list: Appearance[] }) {
  if (list.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="space-y-2">
        {list.map((a) => (
          <li key={a.match.id}>
            <ScoreCard match={a.match} highlight={a.side} />
          </li>
        ))}
      </ul>
    </section>
  );
}
