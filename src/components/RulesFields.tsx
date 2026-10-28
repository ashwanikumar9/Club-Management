"use client";

import { useState, type ReactNode } from "react";
import { matchingPreset, RULE_PRESETS } from "@/lib/rally/presets";
import { describeRules } from "@/lib/rally/rules";
import type { RallyRules, SportKey } from "@/lib/rally/types";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/**
 * Editable rally rules. Used when creating a match, tie or tournament and by the scorer before/during the
 * match. With a sport, ready-made presets come first and the numbers stay one tap away.
 */
export function RulesFields({
  rules,
  setLabel,
  onChange,
  sport,
}: {
  rules: RallyRules;
  setLabel: string;
  onChange: (rules: RallyRules) => void;
  sport?: SportKey;
}) {
  const preset = sport ? matchingPreset(sport, rules) : undefined;
  const [custom, setCustom] = useState(!sport || !preset);
  const set = (key: keyof RallyRules, value: string) => {
    const parsed = value === "" ? null : Number(value);
    const optional = key === "cap" || key === "switchEvery" || key === "decidingSwitchEvery";
    onChange({ ...rules, [key]: optional ? parsed : (parsed ?? 0) });
  };
  const unit = setLabel.toLowerCase();
  const showSwitch = sport === "volleyball" || !!rules.switchEvery || !!rules.decidingSwitchEvery;

  return (
    <div className="space-y-3">
      {sport && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {RULE_PRESETS[sport].map((p) => {
              const on = preset?.key === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...p.rules })}
                  className={`relative rounded-xl border px-3 py-2.5 text-left text-sm font-semibold leading-snug ${on ? "opt-on" : "border-border bg-surface"}`}
                >
                  {p.label}
                  {p.official && (
                    <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-wide ${on ? "text-white/85" : "text-accent"}`}>★ Official</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">{preset ? preset.hint : `Custom: ${describeRules(rules, setLabel)}`}</p>
          <button type="button" onClick={() => setCustom((c) => !c)} className="text-sm font-medium text-side-a">
            {custom ? "Hide the numbers" : "Customise the numbers"}
          </button>
        </div>
      )}
      {custom && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={`Points per ${unit}`}>
            <input type="number" inputMode="numeric" min={1} value={rules.pointsPerSet || ""} onChange={(e) => set("pointsPerSet", e.target.value)} />
          </Field>
          <Field label="Best of">
            <input type="number" inputMode="numeric" min={1} step={2} value={rules.bestOf || ""} onChange={(e) => set("bestOf", e.target.value)} />
          </Field>
          <Field label="Win by">
            <input type="number" inputMode="numeric" min={1} value={rules.winBy || ""} onChange={(e) => set("winBy", e.target.value)} />
          </Field>
          <Field label="Point cap" hint="Blank = no cap">
            <input type="number" inputMode="numeric" min={1} value={rules.cap ?? ""} onChange={(e) => set("cap", e.target.value)} />
          </Field>
          <Field label={`Deciding ${unit} points`}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={rules.decidingSetPoints || ""}
              onChange={(e) => set("decidingSetPoints", e.target.value)}
            />
          </Field>
          {showSwitch && (
            <>
              <Field label="Change ends every" hint={`Points. Blank = between ${unit}s only (beach: 7)`}>
                <input type="number" inputMode="numeric" min={1} value={rules.switchEvery ?? ""} onChange={(e) => set("switchEvery", e.target.value)} />
              </Field>
              <Field label={`…in the deciding ${unit}`} hint="Blank = same (beach: 5)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={rules.decidingSwitchEvery ?? ""}
                  onChange={(e) => set("decidingSwitchEvery", e.target.value)}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}
