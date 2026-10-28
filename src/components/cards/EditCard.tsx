"use client";

import { useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { Sheet } from "@/components/Sheet";
import { addContact, PROFILE_FIELDS, updateCard, type PlayerCard, type SportProfile } from "@/lib/players/cards";
import { MutationError } from "@/lib/rally/mutations";
import { SPORT_ICON, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { SportKey } from "@/lib/rally/types";
import { addPlayerContact, updatePlayerCard, usePlayerContacts, useUser } from "@/lib/store";

/**
 * Edits the profile part of a card: name, year of birth, club, sports and the playing style in each. The
 * record (matches, wins, titles…) is not here: it is always worked out from the matches themselves.
 */
export function EditCard({ card, mine, onClose }: { card: PlayerCard; mine: boolean; onClose: () => void }) {
  const user = useUser()!;
  const contacts = usePlayerContacts();
  const [name, setName] = useState(card.name);
  const [birthYear, setBirthYear] = useState(card.birthYear ? String(card.birthYear) : "");
  const [club, setClub] = useState(card.club ?? "");
  const [sports, setSports] = useState<SportKey[]>(card.sports);
  const [profiles, setProfiles] = useState<Partial<Record<SportKey, SportProfile>>>(() => {
    // Older cards have one playing hand for every sport: start each sport from it.
    const start = { ...card.profiles };
    if (card.hand)
      for (const s of card.sports) if (!start[s]?.hand) start[s] = { ...start[s], hand: card.hand === "right" ? "Right-handed" : "Left-handed" };
    return start;
  });
  const [hidden, setHidden] = useState(!!card.hidden);
  const [error, setError] = useState<string | null>(null);
  const own = contacts.filter((c) => c.playerId === card.id);
  const year = Number(birthYear);
  const age = birthYear.length === 4 && year ? new Date().getFullYear() - year : null;

  function setField(sport: SportKey, key: string, value: string) {
    setProfiles({ ...profiles, [sport]: { ...profiles[sport], [key]: value || undefined } });
  }

  function save() {
    const kept = Object.fromEntries(sports.map((s) => [s, profiles[s] ?? {}]));
    const err = updatePlayerCard(card.id, (c) =>
      updateCard(c, contacts, user, { name, club, sports, hidden, birthYear: birthYear.trim() ? year : null, profiles: kept, hand: null }),
    );
    setError(err);
    if (!err) onClose();
  }

  return (
    <Sheet title={mine ? "Edit my profile" : "Edit card"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Card name" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Year of birth</span>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="e.g. 2002"
              inputMode="numeric"
              aria-label="Year of birth"
            />
            <span className="mt-1 block text-xs text-muted">{age !== null && age > 0 ? `Shows as age ${age}` : "Optional. Shows your age"}</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Club / team</span>
            <input value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club" />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium">Sports</span>
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
                  {SPORT_ICON[s.key]} {s.name}
                </button>
              );
            })}
          </div>
        </div>

        {sports.map((sport) => (
          <fieldset key={sport} className={`sport-${sport} sport-soft space-y-2 rounded-xl border p-3`}>
            <legend className="px-1 text-sm font-semibold">
              {SPORT_ICON[sport]} How you play {SPORTS[sport].name.toLowerCase()}
            </legend>
            {PROFILE_FIELDS[sport].map((f) => (
              <div key={f.key}>
                <span className="mb-1 block text-xs font-medium text-muted">{f.label}</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${SPORTS[sport].name} ${f.label.toLowerCase()}`}>
                  {f.options.map((o) => {
                    const on = profiles[sport]?.[f.key] === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setField(sport, f.key, on ? "" : o)}
                        className={`rounded-full border px-2.5 py-1 text-xs ${on ? "opt-on font-semibold" : "border-border bg-surface"}`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        ))}

        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Matches, wins, titles and form can&rsquo;t be edited: they come from the scored matches.
        </p>
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
          <button type="button" onClick={save} className="btn-grad rounded-xl py-2.5 text-sm font-semibold">
            Save
          </button>
        </div>
      </div>
    </Sheet>
  );
}
