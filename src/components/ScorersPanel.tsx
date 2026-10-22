"use client";

import { useState } from "react";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { addScorer, handOverScoring, isOrganiser, removeScorer } from "@/lib/rally/mutations";
import type { Match } from "@/lib/rally/types";
import { updateMatch } from "@/lib/store";
import { IdentityForm } from "./IdentityForm";

/**
 * Who may score this match and who is scoring now. Anyone with access can add a backup scorer
 * (e.g. when their battery is low); the current scorer can hand over; the organiser can remove people.
 */
export function ScorersPanel({ match, user }: { match: Match; user: string }) {
  const [error, setError] = useState<string | null>(null);
  const organiser = isOrganiser(match, user);
  const inControl = match.activeScorer === user;
  const people = [
    { user: match.organiser, note: "Organiser" },
    ...match.scorers.map((s) => ({ user: s.user, note: `Added by ${s.addedBy === user ? "you" : s.addedBy}` })),
  ];
  const run = (mutation: (m: Match) => Match) => setError(updateMatch(match.id, mutation));

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Scoring access</h2>
      <p className="mt-0.5 text-xs text-muted">One person scores at a time. Anyone listed can take over from the current score.</p>

      <ul className="mt-3 divide-y divide-border">
        {people.map((p) => {
          const active = match.activeScorer === p.user;
          return (
            <li key={p.user} className="flex items-center gap-2 py-2 text-sm">
              <span aria-hidden>{IDENTITY_ICON[identityKind(p.user)]}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {p.user}
                  {p.user === user && <span className="font-normal text-muted"> (you)</span>}
                </div>
                <div className="text-xs text-muted">{p.note}</div>
              </div>
              {active && (
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">Scoring now</span>
              )}
              {inControl && !active && match.status === "live" && (
                <button
                  type="button"
                  onClick={() => run((m) => handOverScoring(m, user, p.user))}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium"
                >
                  Hand over
                </button>
              )}
              {organiser && p.user !== match.organiser && (
                <button
                  type="button"
                  aria-label={`Remove ${p.user}`}
                  onClick={() => run((m) => removeScorer(m, user, p.user))}
                  className="shrink-0 rounded px-1.5 text-danger"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {match.status !== "closed" && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium">Give someone scoring access</p>
          <IdentityForm submitLabel="Add" onSubmit={(key) => updateMatch(match.id, (m) => addScorer(m, user, key))} />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
