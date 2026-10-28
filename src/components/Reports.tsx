"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { loadReportSettings, removeReportEmail, reportsApi, setReportMonthly, type ReportSettings } from "@/lib/remote";
import { isRemote, useUser } from "@/lib/store";

/**
 * "Email reports" on My card: the address reports go to (confirmed with a code), the monthly summary switch,
 * and "email me my report now" for each of the person's cards.
 */
export function ReportsPanel({ cards }: { cards: { id: string; name: string }[] }) {
  const user = useUser();
  const [settings, setSettings] = useState<ReportSettings | null | undefined>(undefined);
  const [pending, setPending] = useState<{ email: string; token: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRemote || !user) return;
    let live = true;
    loadReportSettings().then(
      (s) => live && setSettings(s),
      () => live && setSettings(null),
    );
    return () => {
      live = false;
    };
  }, [user]);

  if (!isRemote)
    return (
      <Box>
        <p className="text-sm text-muted">Email reports work once the database is connected.</p>
      </Box>
    );
  if (!user || settings === undefined) return null;

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    const r = await reportsApi<{ email: string }>("email/confirm", { token: pending.token, code });
    setBusy(false);
    if (r.error) return setError(r.error);
    setSettings({ email: r.email, monthly: true });
    setPending(null);
    setCode("");
    setError(null);
  }

  return (
    <Box>
      {settings ? (
        <div className="space-y-3">
          <p className="text-sm">
            Reports go to <strong className="break-all">{settings.email}</strong>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.monthly}
              onChange={(e) => {
                const wanted = e.target.checked;
                setSettings({ ...settings, monthly: wanted });
                setReportMonthly(wanted).catch((err: Error) => setError(err.message));
              }}
            />
            Monthly summary on the 1st of each month
          </label>
          {cards.map((c) => (
            <EmailReportButton key={c.id} kind="player" id={c.id} label={cards.length > 1 ? `Email me ${c.name}'s report now` : "Email me my report now"} />
          ))}
          <button
            type="button"
            onClick={() => {
              if (!confirm_(`Stop emailing reports to ${settings.email}?`)) return;
              removeReportEmail().then(
                () => setSettings(null),
                (err: Error) => setError(err.message),
              );
            }}
            className="text-xs text-muted underline"
          >
            Change or remove this email
          </button>
        </div>
      ) : pending ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
          className="space-y-2"
        >
          <p className="text-sm">
            Enter the code we emailed to <strong className="break-all">{pending.email}</strong>.
          </p>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6-digit code" aria-label="Report email code" autoFocus />
            <button type="submit" disabled={busy || code.trim().length < 6} className="btn-grad shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-40">
              {busy ? "Checking…" : "Confirm"}
            </button>
          </div>
          <button type="button" onClick={() => setPending(null)} className="text-xs text-muted underline">
            Use a different email
          </button>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Get a detailed report of your matches, wins, form, titles and upcoming games by email, whenever you ask and once a month. Email isn&rsquo;t used to
            sign in.
          </p>
          <IdentityForm
            submitLabel={busy ? "Sending…" : "Send code"}
            only="email"
            allowUsername={false}
            onSubmit={(email) => {
              setBusy(true);
              setError(null);
              void reportsApi<{ token: string }>("email/start", { email }).then((r) => {
                setBusy(false);
                if (r.error) setError(r.error);
                else setPending({ email, token: r.token });
              });
              return null;
            }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Box>
  );
}

const confirm_ = (message: string) => window.confirm(message);

function Box({ children }: { children: React.ReactNode }) {
  return (
    <section id="reports" className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-2 font-semibold">📧 Email reports</h2>
      {children}
    </section>
  );
}

/** Sends one report by email to the person's confirmed report address. */
export function EmailReportButton({ kind, id, label = "Email me the report" }: { kind: "player" | "tournament" | "meet"; id: string; label?: string }) {
  const [state, setState] = useState<{ busy?: boolean; done?: string; error?: string }>({});
  if (!isRemote) return null;
  return (
    <div>
      <button
        type="button"
        disabled={state.busy}
        onClick={() => {
          setState({ busy: true });
          void reportsApi<{ sentTo: string }>("send", { kind, id }).then((r) => setState(r.error ? { error: r.error } : { done: r.sentTo }));
        }}
        className="w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        📧 {state.busy ? "Sending…" : label}
      </button>
      {state.done && <p className="mt-1 text-xs text-accent">Sent to {state.done}.</p>}
      {state.error && (
        <p className="mt-1 text-xs text-danger">
          {state.error}{" "}
          {/Add an email/.test(state.error) && (
            <Link href="/me#reports" className="underline">
              Add one
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
