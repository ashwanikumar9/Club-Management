"use client";

import { useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY, parseIdentity } from "@/lib/identity";
import { isRemote } from "@/lib/store";

/** One field that accepts a mobile number, email address or username. */
export function IdentityForm({
  submitLabel,
  onSubmit,
  autoFocus = false,
  allowUsername = !isRemote,
}: {
  submitLabel: string;
  /** Usernames can't receive sign-in codes, so they are only offered in prototype mode. */
  allowUsername?: boolean;
  /** Returns an error message to show, or null on success. */
  onSubmit: (key: string) => string | null;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = parseIdentity(value, country, allowUsername);
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
        {/* Shows just "+91" while the native list (opened on tap) shows full country names. */}
        <div className="relative w-[4.75rem] shrink-0">
          <span
            aria-hidden
            className="tabular flex h-full items-center justify-between rounded-lg border border-border bg-surface px-2.5 text-sm"
          >
            +{country} <span className="text-xs text-muted">▾</span>
          </span>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country code for mobile numbers"
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                +{c.code} {c.name}
              </option>
            ))}
          </select>
        </div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={allowUsername ? "Mobile number, email or username" : "Mobile number or email"}
          aria-label={allowUsername ? "Mobile number, email or username" : "Mobile number or email"}
          autoComplete="off"
          autoCapitalize="none"
          autoFocus={autoFocus}
        />
        <button type="button" onClick={submit} className="btn-grad shrink-0 rounded-lg px-4 text-sm font-semibold">
          {submitLabel}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">The country code is used for mobile numbers typed without “+”.</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
