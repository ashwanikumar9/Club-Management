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
      {user ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Signed in as ${user}`}
          title={user}
          className="btn-grad grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold uppercase"
        >
          {user.replace(/^[@+]/, "").slice(0, 1)}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-grad shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold">
          Sign in
        </button>
      )}
      {open && (
        <Sheet title={user ? "Signed in" : "Sign in"} onClose={() => setOpen(false)}>
          {user && (
            <p className="mb-3 text-sm">
              {IDENTITY_ICON[identityKind(user)]} You are signed in as <strong className="break-all">{user}</strong>.
            </p>
          )}
          {isRemote ? (
            !user && <CodeSignIn onDone={() => setOpen(false)} />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {user ? "Switch to another person to try the scorer hand-over on one device:" : "Use your mobile number (or a username, in this prototype)."}
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

/**
 * Mobile number → one-time code by SMS → signed in. Email sign-in stays available behind a small link until
 * SMS codes are switched on for the database (email is otherwise only used for reports).
 */
function CodeSignIn({ onDone }: { onDone: () => void }) {
  const [identity, setIdentity] = useState<string | null>(null);
  const [byEmail, setByEmail] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity) {
    return (
      <>
        <p className="mb-3 text-sm text-muted">
          {byEmail ? "We’ll email you a one-time code." : "Your mobile number is your player ID. We’ll text you a one-time code."}
        </p>
        <IdentityForm
          key={byEmail ? "email" : "phone"}
          submitLabel="Send code"
          autoFocus
          allowUsername={false}
          only={byEmail ? "email" : "phone"}
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
        <button
          type="button"
          onClick={() => {
            setByEmail(!byEmail);
            setError(null);
          }}
          className="mt-4 text-xs text-muted underline"
        >
          {byEmail ? "Use my mobile number" : "Can’t get an SMS? Use email instead"}
        </button>
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
        <button type="submit" disabled={busy || code.trim().length < 6} className="btn-grad shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-40">
          {busy ? "Checking…" : "Sign in"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" onClick={() => setIdentity(null)} className="mt-3 text-sm text-muted underline">
        Use a different number
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
