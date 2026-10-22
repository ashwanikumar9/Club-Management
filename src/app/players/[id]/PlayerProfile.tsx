"use client";

import Link from "next/link";
import { use, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { PlayerCardView } from "@/components/cards/PlayerCardView";
import { ScoreCard } from "@/components/cards/ScoreCard";
import { Sheet } from "@/components/Sheet";
import { addContact, canEditCard, ownsCard, updateCard, type PlayerCard } from "@/lib/players/cards";
import { playerStats, type Appearance } from "@/lib/players/stats";
import { MutationError } from "@/lib/rally/mutations";
import { SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { SportKey } from "@/lib/rally/types";
import { addPlayerContact, updatePlayerCard, useMatches, usePlayer, usePlayerContacts, useTies, useTournaments, useUser } from "@/lib/store";

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
          Edit card
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

      {editing && <EditCard card={card} onClose={() => setEditing(false)} />}
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

function EditCard({ card, onClose }: { card: PlayerCard; onClose: () => void }) {
  const user = useUser()!;
  const contacts = usePlayerContacts();
  const [name, setName] = useState(card.name);
  const [club, setClub] = useState(card.club ?? "");
  const [hand, setHand] = useState<"right" | "left" | "">(card.hand ?? "");
  const [sports, setSports] = useState<SportKey[]>(card.sports);
  const [hidden, setHidden] = useState(!!card.hidden);
  const [error, setError] = useState<string | null>(null);
  const own = contacts.filter((c) => c.playerId === card.id);

  function save() {
    const err = updatePlayerCard(card.id, (c) => updateCard(c, contacts, user, { name, club, hand: hand || null, sports, hidden }));
    setError(err);
    if (!err) onClose();
  }

  return (
    <Sheet title="Edit card" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Card name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Club / team</span>
            <input value={club} onChange={(e) => setClub(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Playing hand</span>
            <select value={hand} onChange={(e) => setHand(e.target.value as typeof hand)}>
              <option value="">Not set</option>
              <option value="right">Right</option>
              <option value="left">Left</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {SPORT_LIST.map((s) => {
            const on = sports.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSports(on ? sports.filter((x) => x !== s.key) : [...sports, s.key])}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-foreground font-semibold" : "border-border text-muted"}`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hide from search and the players list
        </label>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-sm font-medium">Mobile numbers and emails</p>
          <p className="text-xs text-muted">Private. Signing in with any of these makes the card that person&rsquo;s.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {own.map((c) => (
              <li key={c.contact}>{c.contact}</li>
            ))}
            {card.contactHints.length > own.length && (
              <li className="text-muted">{card.contactHints.length - own.length} more added by someone else</li>
            )}
          </ul>
          <div className="mt-2">
            <IdentityForm
              submitLabel="Add"
              allowUsername={false}
              onSubmit={(key) => {
                try {
                  const r = addContact(card, contacts, user, key);
                  return addPlayerContact(r.row, r.card);
                } catch (e) {
                  if (e instanceof MutationError) return e.message;
                  throw e;
                }
              }}
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-border py-2.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={save} className="rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background">
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}
