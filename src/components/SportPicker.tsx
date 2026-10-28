"use client";

import { SPORT_ICON, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { SportKey } from "@/lib/rally/types";

/** Sport choice as coloured tiles: the chosen sport fills with its gradient. */
export function SportPicker({
  value,
  onChange,
  sports = SPORT_LIST.map((s) => s.key),
}: {
  value: SportKey | null;
  onChange: (sport: SportKey) => void;
  sports?: SportKey[];
}) {
  return (
    <div className={`grid gap-2 ${sports.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {sports.map((key) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={`sport-${key} ${on ? "sport-tile shadow-md" : "sport-soft"} rounded-2xl border px-2 py-3 text-center active:scale-[0.98]`}
          >
            <span className="block text-2xl" aria-hidden>
              {SPORT_ICON[key]}
            </span>
            <span className="mt-1 block text-sm font-semibold">{SPORTS[key].name}</span>
          </button>
        );
      })}
    </div>
  );
}
