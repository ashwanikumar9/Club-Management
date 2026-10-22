"use client";

import { useEffect, useState } from "react";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { isRemote, onSyncError, sendSignInCode, setUser, useUser, verifySignInCode } from "@/lib/store";
import { IdentityForm } from "./IdentityForm";
import { Sheet } from "./Sheet";

export function UserMenu() {
  const user = useUser();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-[55%] truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm font-medium"
      >
        {user ? `${IDENTITY_ICON[identityKind(user)]} ${user}` : "Sign in"}
      </button>
      {open && (
        <Sheet title={user ? "Signed in" : "Sign in"} onClose={() => setOpen(false)}>
          {user && (
            <p className="mb-3 text-sm">
              You are signed in as <strong>{user}</strong>.
            </p>
          )}
          {isRemote ? (
            !user && <CodeSignIn onDone={() => setOpen(false)} />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {user ? "Switch to another person to try the scorer hand-over on one device:" : "Use your mobile number, email or username."}
              </p>
              <IdentityForm
                submitLabel={user ? "Switch" : "Sign in"}
                autoFocus
                onSubmit={(key) => {
                  setUser(key);
                  setOpen(false);
                  return null;
                }}
              />
              <p className="mt-3 text-xs text-muted">
                Prototype mode: no verification code, and data stays in this browser. Connect the database to share live
                scores between phones and sign in with a one-time code.
              </p>
            </>
          )}
          {user && (
            <button
              type="button"
              onClick={() => {
                setUser(null);
                setOpen(false);
              }}
              className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-medium"
            >
              Sign out
            </button>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Email or mobile number → one-time code → signed in. */
function CodeSignIn({ onDone }: { onDone: () => void }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity) {
    return (
      <>
        <p className="mb-3 text-sm text-muted">We&rsquo;ll send a one-time code to your email or mobile number.</p>
        <IdentityForm
          submitLabel="Send code"
          autoFocus
          allowUsername={false}
          onSubmit={(key) => {
            setBusy(true);
            setError(null);
            void sendSignInCode(key).then((err) => {
              setBusy(false);
              if (err) setError(err);
              else setIdentity(key);
            });
            return null;
          }}
        />
        {busy && <p className="mt-2 text-sm text-muted">Sending…</p>}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void verifySignInCode(identity, code).then((err) => {
          setBusy(false);
          if (err) setError(err);
          else onDone();
        });
      }}
    >
      <p className="mb-2 text-sm">
        Enter the code sent to <strong>{identity}</strong>.
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          aria-label="Sign-in code"
          autoFocus
        />
        <button type="submit" disabled={busy || code.trim().length < 6} className="shrink-0 rounded-lg bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
          {busy ? "Checking…" : "Sign in"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" onClick={() => setIdentity(null)} className="mt-3 text-sm text-muted underline">
        Use a different email or number
      </button>
    </form>
  );
}

/** Shows problems saving a change made on this device (e.g. no connection, no permission). */
export function SyncNotice() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => onSyncError(setMessage), []);
  if (!message) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="mx-auto block w-full max-w-lg rounded-xl bg-danger px-4 py-3 text-left text-sm font-medium text-white shadow-lg"
      >
        {message} <span className="float-right">✕</span>
      </button>
    </div>
  );
}
