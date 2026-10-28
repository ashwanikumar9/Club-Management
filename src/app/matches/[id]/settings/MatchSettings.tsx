"use client";

import Link from "next/link";
import { use } from "react";
import { MatchGate, matchSubtitle, useMatchView } from "@/components/match-ui";
import { hasScoringAccess, newId, updateActions, updateSettings } from "@/lib/rally/mutations";
import { SPORTS } from "@/lib/rally/sports";
import type { ActionDef, Match } from "@/lib/rally/types";
import { updateMatch, useUser } from "@/lib/store";

/** Shot-type catalogue and detail toggles. Editable at any time; changes apply to new points only. */
export function MatchSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { match } = useMatchView(id);
  const user = useUser();
  return (
    <MatchGate match={match}>
      {(m) =>
        hasScoringAccess(m, user) ? (
          <Editor match={m} />
        ) : (
          <p className="py-10 text-center text-muted">Only the organiser and scorers of this match can change scoring detail.</p>
        )
      }
    </MatchGate>
  );
}

function Editor({ match }: { match: Match }) {
  const user = useUser() ?? "";
  const save = (actions: ActionDef[]) => updateMatch(match.id, (m) => updateActions(m, user, actions));
  const change = (key: string, patch: Partial<ActionDef>) =>
    save(match.actions.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const toggle = (key: "askHow" | "askWho") => updateMatch(match.id, (m) => updateSettings(m, user, { [key]: !m.settings[key] }));

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{matchSubtitle(match)}</p>
          <h1 className="text-xl font-bold">Scoring detail</h1>
        </div>
        <Link
          href={match.status === "closed" ? `/matches/${match.id}` : `/matches/${match.id}/score`}
          className="btn-grad shrink-0 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Done
        </Link>
      </div>

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">After each point, ask</h2>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={match.settings.askHow} onChange={() => toggle("askHow")} />
          How the point was won (shot type)
        </label>
        {match.format !== "singles" && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={match.settings.askWho} onChange={() => toggle("askWho")} />
            Who scored / who made the error
          </label>
        )}
        <p className="text-xs text-muted">
          With both off, scoring is a plain +1 and commentary reads &ldquo;Point to …&rdquo;. You can switch at any time during the match.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Shot types</h2>
          <button
            type="button"
            className="text-sm text-muted underline"
            onClick={() => {
              if (confirm("Reset shot types to the standard list for this sport?")) save(structuredClone(SPORTS[match.sport].actions));
            }}
          >
            Reset to defaults
          </button>
        </div>
        <p className="text-xs text-muted">
          Commentary lines can use <code>{"{player}"}</code>, <code>{"{side}"}</code>, <code>{"{opponent}"}</code> and{" "}
          <code>{"{opponentSide}"}</code>. Add several lines (one per line) for variety. Changes apply to new points; earlier commentary stays as recorded.
        </p>

        {match.actions.map((a) => (
          <div key={a.key} className={`space-y-2 rounded-2xl border border-border bg-surface p-4 ${a.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-2">
              <input value={a.label} onChange={(e) => change(a.key, { label: e.target.value })} aria-label="Shot type name" className="font-medium" />
              <label className="flex shrink-0 items-center gap-1.5 text-sm">
                <input type="checkbox" checked={a.enabled} onChange={() => change(a.key, { enabled: !a.enabled })} />
                Show
              </label>
            </div>
            <select
              value={a.credit}
              onChange={(e) => change(a.key, { credit: e.target.value as ActionDef["credit"] })}
              aria-label="Point type"
            >
              <option value="winner">Winning shot by the scoring side</option>
              <option value="error">Error by the opponent</option>
            </select>
            <textarea
              rows={Math.max(2, a.templates.length)}
              value={a.templates.join("\n")}
              onChange={(e) => change(a.key, { templates: e.target.value.split("\n") })}
              onBlur={() => change(a.key, { templates: a.templates.map((t) => t.trim()).filter(Boolean) })}
              aria-label="Commentary lines"
              className="text-sm"
            />
            <button
              type="button"
              className="text-sm text-danger"
              onClick={() => save(match.actions.filter((x) => x.key !== a.key))}
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            save([
              ...match.actions,
              { key: `custom_${newId()}`, label: "New shot type", credit: "winner", templates: ["{player} wins the point"], enabled: true },
            ])
          }
          className="w-full rounded-xl border border-dashed border-border py-3 text-sm font-medium"
        >
          + Add shot type
        </button>
      </section>
    </div>
  );
}
