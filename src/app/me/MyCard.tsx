"use client";

import Link from "next/link";
import { useState } from "react";
import { EditCard } from "@/components/cards/EditCard";
import { PlayerCardView } from "@/components/cards/PlayerCardView";
import { identityKind } from "@/lib/identity";
import { myCards, type PlayerCard } from "@/lib/players/cards";
import { playerStats } from "@/lib/players/stats";
import { useMatches, usePlayerContacts, usePlayers, useTies, useTournaments, useUser } from "@/lib/store";

/** The signed-in person's own card(s), reachable from the header at all times. */
export function MyCard() {
  const user = useUser();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const matches = useMatches();
  const ties = useTies();
  const tournaments = useTournaments();
  const [editing, setEditing] = useState<PlayerCard | null>(null);

  if (!user) {
    return (
      <div className="space-y-2 py-6 text-center">
        <h1 className="text-xl font-bold">My player card</h1>
        <p className="text-muted">Sign in (top right) with your mobile number or email to see your card.</p>
      </div>
    );
  }
  if (!cards || !matches || !ties || !tournaments) return <p className="py-10 text-center text-muted">Loading…</p>;
  const mine = myCards(Object.values(cards), contacts, user);
  const canOwn = identityKind(user) !== "username";

  return (
    <div className="space-y-4 pb-10">
      <h1 className="text-xl font-bold">My player card</h1>
      {mine.map((c) => (
        <div key={c.id} className="space-y-2">
          <PlayerCardView card={c} stats={playerStats(c.id, { matches, ties }, Object.values(tournaments))} href={`/players/${c.id}`} mine />
          <button type="button" onClick={() => setEditing(c)} className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold">
            Edit my profile: name, age, playing style
          </button>
        </div>
      ))}
      {editing && <EditCard card={cards[editing.id] ?? editing} mine onClose={() => setEditing(null)} />}
      {mine.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-dashed border-border p-6 text-center">
          {canOwn ? (
            <>
              <p className="font-medium">No card linked to {user} yet</p>
              <p className="text-sm text-muted">
                If an organiser already made a card for you with this {identityKind(user) === "email" ? "email" : "number"}, it appears here
                automatically. Otherwise create your own.
              </p>
              <Link href="/players/new" className="btn-grad inline-block rounded-lg px-4 py-2 text-sm font-semibold">
                Create my card
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">Player cards belong to a mobile number or email. Sign in with one of those to have your own card.</p>
          )}
        </div>
      )}
    </div>
  );
}
