"use client";

import type { ReactNode } from "react";
import type { RallyRules } from "@/lib/rally/types";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Editable rally rules. Used when creating a match and by the scorer before/during the match. */
export function RulesFields({
  rules,
  setLabel,
  onChange,
}: {
  rules: RallyRules;
  setLabel: string;
  onChange: (rules: RallyRules) => void;
}) {
  const set = (key: keyof RallyRules, value: string) => {
    const parsed = value === "" ? null : Number(value);
    onChange({ ...rules, [key]: key === "cap" ? parsed : (parsed ?? 0) });
  };
  const unit = setLabel.toLowerCase();

  return (
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
    </div>
  );
}
