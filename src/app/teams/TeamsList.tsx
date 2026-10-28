"use client";

import Link from "next/link";
import { useState } from "react";
import { SportPicker } from "@/components/SportPicker";
import { TeamCard } from "@/components/TeamBits";
import { myCards } from "@/lib/players/cards";
import type { SportKey } from "@/lib/rally/types";
import { myTeams, searchTeams } from "@/lib/teams/teams";
import { usePlayerContacts, usePlayers, useTeams, useUser } from "@/lib/store";

export function TeamsList() {
  const user = useUser();
  const teams = useTeams();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<SportKey | null>(null);
  if (!teams) return <p className="py-10 text-center text-muted">Loading…</p>;
  const all = Object.values(teams);
  const mine = myTeams(all, user, cards ? myCards(Object.values(cards), contacts, user).map((c) => c.id) : []);
  const found = searchTeams(all, query, sport ?? undefined).filter((t) => !mine.includes(t));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Teams</h1>
        {user && (
          <Link href="/teams/new" className="btn-grad rounded-lg px-3 py-2 text-sm font-semibold">
            + New team
          </Link>
        )}
      </div>
      {mine.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your teams</h2>
          {mine.map((t) => (
            <TeamCard key={t.id} team={t} note={t.organiser === user || t.scorers.includes(user ?? "") ? "You manage this team" : "You play here"} />
          ))}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Find a team</h2>
        <SportPicker value={sport} onChange={(s) => setSport(sport === s ? null : s)} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or city" aria-label="Search teams" />
        {found.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">No teams found.</p>
        ) : (
          found.slice(0, 50).map((t) => <TeamCard key={t.id} team={t} />)
        )}
      </section>
    </div>
  );
}
