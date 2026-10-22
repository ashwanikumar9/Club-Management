"use client";

import { useState } from "react";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { setUser, useUser } from "@/lib/store";
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
            Prototype: no password or verification code yet. Real sign-in with a one-time code by SMS or email comes with the
            database.
          </p>
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
