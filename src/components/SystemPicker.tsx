"use client";

import { systemsFor, tieSystem } from "@/lib/tie/systems";

/** Official team formats for a sport, or "Custom" (choose the number of matches yourself). */
export function SystemPicker({ sport, value, onChange }: { sport: string; value: string; onChange: (key: string) => void }) {
  const systems = systemsFor(sport);
  const chosen = tieSystem(value);
  const option = (key: string, label: string, hint: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onChange(key)}
      className={`block w-full rounded-xl border p-3 text-left ${value === key ? "border-2 border-foreground" : "border-border bg-surface"}`}
    >
      <span className="font-semibold">{label}</span>
      <span className="mt-0.5 block text-xs text-muted">{hint}</span>
    </button>
  );
  return (
    <div className="space-y-2">
      {systems.map((x) => option(x.key, x.label, x.hint))}
      {option("", "Custom", "Choose the number of matches; singles or doubles picked per match")}
      {chosen && (
        <ol className="rounded-xl bg-surface-2 px-4 py-2 text-sm">
          {chosen.slots.map((s, i) => (
            <li key={i} className="flex justify-between gap-2 py-0.5">
              <span>Match {i + 1}</span>
              <span className="text-muted">
                {s.label}
                {s.letters ? "" : ` · ${s.format}`}
              </span>
            </li>
          ))}
          {chosen.letters && (
            <li className="pt-1 text-xs text-muted">
              Each captain gives letters to their players ({chosen.letters.A.join(", ")} / {chosen.letters.B.join(", ")}) on the tie page;
              the singles fill themselves in.
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
