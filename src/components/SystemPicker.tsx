"use client";

import { systemsFor, tieSystem } from "@/lib/tie/systems";

/** Official team formats for a sport, or "Custom" (choose the number of matches yourself). */
export function SystemPicker({ sport, value, onChange }: { sport: string; value: string; onChange: (key: string) => void }) {
  const systems = systemsFor(sport);
  const chosen = tieSystem(value);
  const option = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={value === key}
      className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold leading-snug ${value === key ? "opt-on" : "border-border bg-surface"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {systems.map((x) => option(x.key, x.label))}
        {option("", "Custom")}
      </div>
      <p className="text-xs text-muted">{chosen ? chosen.hint : "Choose the number of matches; singles or doubles picked per match."}</p>
      {chosen && (
        <div className="rounded-xl bg-surface-2 p-3">
          <ol className="flex flex-wrap gap-1.5 text-xs">
            {chosen.slots.map((s, i) => (
              <li key={i} className="rounded-full bg-surface px-2 py-1">
                <span className="font-semibold">{i + 1}</span> {s.label}
              </li>
            ))}
          </ol>
          {chosen.letters && (
            <p className="mt-2 text-xs text-muted">
              Captains give letters ({chosen.letters.A.join(", ")} / {chosen.letters.B.join(", ")}) to players on the tie page; the singles fill in.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
