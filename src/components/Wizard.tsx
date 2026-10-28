"use client";

import type { ReactNode } from "react";

/** Title of a step-by-step form: back button, "Step 2 of 4" and a coloured progress bar. */
export function StepHeader({ step, total, title, onBack }: { step: number; total: number; title: string; onBack?: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {onBack && step > 1 && (
          <button type="button" onClick={onBack} aria-label="Back" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface">
            ←
          </button>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Step {step} of {total}
          </p>
          <h1 className="truncate text-xl font-bold">{title}</h1>
        </div>
      </div>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "btn-grad" : "bg-surface-2"}`} />
        ))}
      </div>
    </div>
  );
}

/** Buttons pinned to the bottom of the screen on forms, so the next action is always in reach. */
export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="action-bar flex gap-2">{children}</div>;
}
