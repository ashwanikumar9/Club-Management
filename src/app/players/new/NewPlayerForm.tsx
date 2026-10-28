"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { identityKind } from "@/lib/identity";
import { createCard, myCards } from "@/lib/players/cards";
import { MutationError } from "@/lib/rally/mutations";
import { SPORT_LIST } from "@/lib/rally/sports";
import type { SportKey } from "@/lib/rally/types";
import { savePlayerCard, usePlayerContacts, usePlayers, useUser } from "@/lib/store";

/** Create a player card: by an organiser for a player, or by a player for themselves. */
export function NewPlayerForm() {
  const router = useRouter();
  const user = useUser();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const [name, setName] = useState("");
  const [list, setList] = useState<string[]>([]);
  const [isMe, setIsMe] = useState<boolean | null>(null);
  const [sports, setSports] = useState<SportKey[]>([]);
  const [club, setClub] = useState("");
  const [hand, setHand] = useState<"right" | "left" | "">("");
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="space-y-2 py-6 text-center">
        <h1 className="text-xl font-bold">New player card</h1>
        <p className="text-muted">Sign in first (top right).</p>
      </div>
    );
  }
  const canBeMine = identityKind(user) !== "username";
  // Default "this is me" on when the signed-in person has no card yet.
  const me = canBeMine && (isMe ?? (cards ? myCards(Object.values(cards), contacts, user).length === 0 : false));
  const allContacts = me && !list.includes(user) ? [user, ...list] : list;

  function submit() {
    try {
      const r = createCard({ name, contacts: allContacts, sports, club, hand: hand || undefined, by: user! });
      savePlayerCard(r.card, r.contacts);
      router.push(`/players/${r.card.id}`);
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  return (
    <form
      className="space-y-5 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <h1 className="text-xl font-bold">New player card</h1>
        <p className="text-sm text-muted">One card per person, used in every sport, match, tie and tournament.</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Sharma" />
        </label>
        {canBeMine && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={me} onChange={(e) => setIsMe(e.target.checked)} />
            This is my own card ({user})
          </label>
        )}
        <div>
          <span className="mb-1 block text-sm font-medium">{me ? "Other mobile numbers or emails (optional)" : "Player's mobile number or email (required)"}</span>
          <IdentityForm
            submitLabel="Add"
            allowUsername={false}
            onSubmit={(key) => {
              if (allContacts.includes(key)) return "Already added.";
              setList([...list, key]);
              return null;
            }}
          />
          {allContacts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {allContacts.map((c) => (
                <li key={c} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                  {c}
                  {list.includes(c) && (
                    <button type="button" aria-label={`Remove ${c}`} onClick={() => setList(list.filter((x) => x !== c))} className="px-2 text-muted">
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">
            Kept private: only you and the player can see it. When the player signs in with it, the card becomes theirs to keep
            and edit.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <span className="block text-sm font-medium">Sports</span>
        <div className="flex flex-wrap gap-2">
          {SPORT_LIST.map((s) => {
            const on = sports.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSports(on ? sports.filter((x) => x !== s.key) : [...sports, s.key])}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "opt-on font-semibold" : "border-border text-muted"}`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Club / team</span>
            <input value={club} onChange={(e) => setClub(e.target.value)} placeholder="Optional" />
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
      </section>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" className="btn-grad w-full rounded-xl py-3 font-semibold">
        Create card
      </button>
    </form>
  );
}
