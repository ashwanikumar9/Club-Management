"use client";

import Link from "next/link";
import { useState } from "react";
import { PlayerCardView } from "@/components/cards/PlayerCardView";
import { ownsCard, searchCards } from "@/lib/players/cards";
import { playerStats } from "@/lib/players/stats";
import { useMatches, usePlayerContacts, usePlayers, useTies, useTournaments, useUser } from "@/lib/store";

/** Every player card, searchable. */
export function PlayersDirectory() {
  const user = useUser();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const matches = useMatches();
  const ties = useTies();
  const tournaments = useTournaments();
  const [query, setQuery] = useState("");
  if (!cards || !matches || !ties || !tournaments) return <p className="py-10 text-center text-muted">Loading…</p>;
  const data = { matches, ties };
  const list = searchCards(Object.values(cards), query, user, contacts);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Players</h1>
        {user && (
          <Link href="/players/new" className="btn-grad rounded-lg px-3 py-2 text-sm font-semibold">
            + New card
          </Link>
        )}
      </div>
      <p className="text-sm text-muted">
        Every player has one card for all sports. Pick it when adding them to a match, tie or tournament and their results,
        titles and form follow them everywhere.
      </p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or club" aria-label="Search players" />
      {list.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No player cards yet.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((c) => (
          <li key={c.id}>
            <PlayerCardView card={c} stats={playerStats(c.id, data, Object.values(tournaments))} href={`/players/${c.id}`} mine={ownsCard(c, contacts, user)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
