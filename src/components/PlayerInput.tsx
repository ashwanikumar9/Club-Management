"use client";

import { CardPicker } from "@/components/cards/CardPicker";
import { COUNTRIES, DEFAULT_COUNTRY, parseIdentity } from "@/lib/identity";
import type { SportKey } from "@/lib/rally/types";
import { ensureCards } from "@/lib/store";

/** A player being entered in a form: name + mobile (or a card picked from the player cards). */
export interface PlayerDraft {
  name: string;
  phone: string;
  country: string;
  jersey?: string;
  /** Set when an existing card was picked; the mobile isn't needed then. */
  cardId?: string;
}

export const emptyPlayer = (): PlayerDraft => ({ name: "", phone: "", country: DEFAULT_COUNTRY });

export const isBlank = (p: PlayerDraft) => !p.name.trim() && !p.phone.trim() && !p.cardId;

/**
 * Name and mobile number of one player. Every player is identified by their mobile (or email), so their results
 * go to one player card that becomes theirs when they sign in with it.
 */
export function PlayerInput({
  value,
  onChange,
  label,
  sport,
  jersey = false,
}: {
  value: PlayerDraft;
  onChange: (next: PlayerDraft) => void;
  /** Accessible name, e.g. "Side A player 1". */
  label: string;
  sport?: SportKey;
  jersey?: boolean;
}) {
  const set = (change: Partial<PlayerDraft>) => onChange({ ...value, ...change });
  return (
    <div className="space-y-1.5 rounded-xl border border-border bg-surface p-2">
      <div className="flex gap-2">
        {jersey && (
          <input
            className="!w-14 shrink-0 !px-2 text-center"
            value={value.jersey ?? ""}
            onChange={(e) => set({ jersey: e.target.value })}
            placeholder="#"
            aria-label={`${label} jersey number`}
            inputMode="numeric"
          />
        )}
        <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name" aria-label={`${label} name`} />
        <CardPicker
          name={value.name}
          cardId={value.cardId}
          sport={sport}
          onPick={(p) => set({ name: p.name, cardId: p.cardId })}
          onUnlink={() => set({ cardId: undefined })}
        />
      </div>
      {!value.cardId && (
        <div className="flex gap-2">
          <div className="relative w-[4.75rem] shrink-0">
            <span aria-hidden className="tabular flex h-full items-center justify-between rounded-lg border border-border bg-surface px-2.5 text-sm">
              +{value.country} <span className="text-xs text-muted">▾</span>
            </span>
            <select
              value={value.country}
              onChange={(e) => set({ country: e.target.value })}
              aria-label={`${label} country code`}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  +{c.code} {c.name}
                </option>
              ))}
            </select>
          </div>
          <input
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="Mobile number (or email)"
            aria-label={`${label} mobile`}
            inputMode="tel"
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );
}

/**
 * Checks the drafts (skipping blank rows) and turns them into player cards. Returns the players, or an error
 * message naming the row to fix.
 */
export async function resolvePlayers(
  drafts: { draft: PlayerDraft; label: string }[],
  by: string,
  sport?: SportKey,
): Promise<{ players: { cardId: string; name: string; jersey?: string }[] } | { error: string }> {
  const rows: { name: string; contact: string; jersey?: string; cardId?: string }[] = [];
  for (const { draft, label } of drafts) {
    if (isBlank(draft)) continue;
    if (!draft.name.trim()) return { error: `Enter the name for ${label}.` };
    if (draft.cardId) {
      rows.push({ name: draft.name, contact: "", jersey: draft.jersey, cardId: draft.cardId });
      continue;
    }
    if (!draft.phone.trim()) return { error: `Enter ${draft.name.trim()}'s mobile number. Every player needs one, so their results go to their player card.` };
    const parsed = parseIdentity(draft.phone, draft.country, false);
    if (!parsed.ok) return { error: `${draft.name.trim()}: ${parsed.error}` };
    rows.push({ name: draft.name, contact: parsed.key, jersey: draft.jersey });
  }
  try {
    const made = await ensureCards(
      rows.filter((r) => !r.cardId),
      by,
      sport,
    );
    let k = 0;
    const players = rows.map((r) => (r.cardId ? { cardId: r.cardId, name: r.name.trim(), jersey: r.jersey } : made[k++]));
    return { players };
  } catch (e) {
    return { error: `Couldn't save the players: ${e instanceof Error ? e.message : String(e)}` };
  }
}
