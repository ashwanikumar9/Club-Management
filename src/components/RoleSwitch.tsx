"use client";

import { setRole, useRole } from "@/lib/store";

/** Prototype stand-in for login: lets the tester act as a scorer or as the organiser. */
export function RoleSwitch() {
  const role = useRole();
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1 text-xs" role="group" aria-label="Acting as">
      {(["scorer", "organiser"] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => setRole(r)}
          aria-pressed={role === r}
          className={`rounded-md px-2.5 py-1 capitalize ${role === r ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
