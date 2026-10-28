"use client";

import { useState } from "react";
import { describeOutcome } from "@/lib/rally/outcome";
import type { Match, MatchOutcome, SideKey } from "@/lib/rally/types";

/**
 * Choose how an unfinished match ended: retirement once play has started, walkover while no point has been
 * played; "no result" is always available.
 */
export function OutcomePicker({
  match,
  kinds,
  confirmLabel,
  onConfirm,
  onCancel,
  initial,
}: {
  match: Match;
  /** Which outcomes to offer besides "no result". */
  kinds: ("retired" | "walkover")[];
  confirmLabel: string;
  onConfirm: (outcome: MatchOutcome) => void;
  onCancel: () => void;
  initial?: MatchOutcome;
}) {
  const options: MatchOutcome[] = [
    ...(kinds.includes("retired") ? (["B", "A"] as SideKey[]).map((winner) => ({ type: "retired" as const, winner })) : []),
    ...(kinds.includes("walkover") ? (["A", "B"] as SideKey[]).map((winner) => ({ type: "walkover" as const, winner })) : []),
    { type: "no_result" },
  ];
  if (initial && !options.some((o) => same(o, initial))) options.unshift(initial);
  const [choice, setChoice] = useState<MatchOutcome | null>(initial ?? null);

  return (
    <div>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={`${o.type}-${o.winner ?? ""}`}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${choice && same(choice, o) ? "opt-on" : "border-border"}`}
          >
            <input type="radio" name="outcome" checked={!!choice && same(choice, o)} onChange={() => setChoice(o)} />
            <span>
              {describeOutcome(match, o)}
              {o.type === "no_result" && <span className="block text-xs text-muted">Abandoned; no points for either side</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-border py-3 font-medium">
          Cancel
        </button>
        <button
          type="button"
          disabled={!choice}
          onClick={() => choice && onConfirm(choice)}
          className="rounded-xl bg-accent py-3 font-bold text-white disabled:opacity-40"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

function same(a: MatchOutcome, b: MatchOutcome) {
  return a.type === b.type && (a.winner ?? null) === (b.winner ?? null);
}
