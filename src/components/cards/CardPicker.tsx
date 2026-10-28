"use client";

import { useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { Sheet } from "@/components/Sheet";
import { createCard, maskContact, searchCards } from "@/lib/players/cards";
import { MutationError } from "@/lib/rally/mutations";
import type { SportKey } from "@/lib/rally/types";
import { savePlayerCard, usePlayerContacts, usePlayers, useUser } from "@/lib/store";

export interface Picked {
  name: string;
  cardId: string;
}

/**
 * Small button next to a player's name: pick the player's card (so the match counts on their profile), or
 * create a new card with their mobile number / email. Shows "✓ Card" once linked.
 */
export function CardPicker({
  name,
  cardId,
  sport,
  onPick,
  onUnlink,
}: {
  name: string;
  cardId?: string;
  sport?: SportKey;
  onPick: (picked: Picked) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (cardId) {
    return (
      <button type="button" onClick={onUnlink} title="Linked to a player card. Tap to unlink." className="shrink-0 rounded-lg bg-accent/15 px-2 text-xs font-semibold text-accent">
        ✓ Card
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Pick a player card${name ? ` for ${name}` : ""}`}
        className="shrink-0 rounded-lg border border-border px-2 text-xs font-medium text-muted"
      >
        + Card
      </button>
      {open && (
        <PickerSheet
          initialName={name}
          sport={sport}
          onClose={() => setOpen(false)}
          onPick={(p) => {
            onPick(p);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function PickerSheet({
  initialName,
  sport,
  onClose,
  onPick,
}: {
  initialName: string;
  sport?: SportKey;
  onClose: () => void;
  onPick: (picked: Picked) => void;
}) {
  const user = useUser();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const [query, setQuery] = useState(initialName);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(initialName);
  const [newContacts, setNewContacts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const found = cards ? searchCards(Object.values(cards), query, user, contacts).slice(0, 20) : [];

  function create() {
    if (!user) {
      setError("Sign in first.");
      return;
    }
    try {
      const r = createCard({ name: newName, contacts: newContacts, sports: sport ? [sport] : [], by: user });
      savePlayerCard(r.card, r.contacts);
      onPick({ name: r.card.name, cardId: r.card.id });
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  return (
    <Sheet title={creating ? "New player card" : "Pick a player card"} onClose={onClose}>
      {!creating ? (
        <div className="space-y-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or club" aria-label="Search player cards" autoFocus />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {found.length === 0 && <li className="p-3 text-sm text-muted">No cards found.</li>}
            {found.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick({ name: c.name, cardId: c.id })} className="block w-full px-3 py-2 text-left">
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">{[c.club, ...c.contactHints].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setCreating(true)} className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold">
            + New player card
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Player name on card" />
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium">Mobile number or email (required)</span>
            <IdentityForm
              submitLabel="Add"
              allowUsername={false}
              onSubmit={(key) => {
                if (newContacts.includes(key)) return "Already added.";
                setNewContacts([...newContacts, key]);
                return null;
              }}
            />
            {newContacts.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {newContacts.map((c) => (
                  <li key={c} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                    {c}
                    <button type="button" aria-label={`Remove ${c}`} onClick={() => setNewContacts(newContacts.filter((x) => x !== c))} className="px-2 text-muted">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Only you and the player can see it; others see {newContacts[0] ? maskContact(newContacts[0]) : "a masked version"}. When the player
              signs in with it, the card becomes theirs.
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setCreating(false)} className="rounded-xl border border-border py-2.5 text-sm">
              Back
            </button>
            <button type="button" onClick={create} className="btn-grad rounded-xl py-2.5 text-sm font-semibold">
              Create & pick
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
