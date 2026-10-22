"use client";

import { useState } from "react";
import { parseIdentity } from "@/lib/identity";

/** One field that accepts a mobile number, email address or username. */
export function IdentityForm({
  submitLabel,
  onSubmit,
  autoFocus = false,
}: {
  submitLabel: string;
  /** Returns an error message to show, or null on success. */
  onSubmit: (key: string) => string | null;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = parseIdentity(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const err = onSubmit(parsed.key);
    setError(err);
    if (!err) setValue("");
  }

  // Not a <form>, so it can sit inside other forms (e.g. the New match form).
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Mobile number, email or username"
          aria-label="Mobile number, email or username"
          autoComplete="off"
          autoCapitalize="none"
          autoFocus={autoFocus}
        />
        <button type="button" onClick={submit} className="shrink-0 rounded-lg bg-foreground px-4 text-sm font-semibold text-background">
          {submitLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
