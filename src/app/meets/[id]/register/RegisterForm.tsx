"use client";

import Link from "next/link";
import { use, useState } from "react";
import { SPORT_ICON } from "@/app/matches/new/NewMatchForm";
import { CardPicker } from "@/components/cards/CardPicker";
import { identityKind } from "@/lib/identity";
import { formFor } from "@/lib/meet/meet";
import { createRegistration } from "@/lib/meet/registration";
import type { Meet, MeetEvent, Registration } from "@/lib/meet/types";
import { MutationError } from "@/lib/rally/mutations";
import { sendRegistration, useMeet, useRegistrations, useUser } from "@/lib/store";

export function RegisterForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meet = useMeet(id);
  if (meet === undefined) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (meet === null) return <p className="py-10 text-center text-muted">This sports meet does not exist.</p>;
  return <Form meet={meet} />;
}

interface Row {
  name: string;
  cardId?: string;
}

const START_ROWS = { singles: 1, doubles: 2, team: 6 } as const;

function Form({ meet }: { meet: Meet }) {
  const user = useUser();
  const existing = useRegistrations();
  const [event, setEvent] = useState<MeetEvent | null>(meet.events.length === 1 ? meet.events[0] : null);
  const [formDone, setFormDone] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [rows, setRows] = useState<Row[]>(Array.from({ length: event ? START_ROWS[event.format] : 1 }, () => ({ name: "" })));
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Registration | null>(null);
  const [busy, setBusy] = useState(false);

  const back = (
    <Link href={`/meets/${meet.id}`} className="text-sm font-medium text-side-a">
      ← {meet.name}
    </Link>
  );

  if (!meet.registration.open) {
    return (
      <div className="space-y-3 py-4">
        {back}
        <p className="rounded-2xl border border-border bg-surface p-4">Registration for {meet.name} is closed.</p>
      </div>
    );
  }
  if (!user || identityKind(user) === "username") {
    return (
      <div className="space-y-3 py-4">
        {back}
        <h1 className="text-xl font-bold">Register a team</h1>
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
          Sign in (top right) with your mobile number or email first. The organiser uses it to reach you, and you&rsquo;ll see your
          request&rsquo;s status here.
        </p>
      </div>
    );
  }
  if (sent) {
    return (
      <div className="space-y-4 py-4">
        {back}
        <div className="rounded-2xl border-2 border-accent bg-accent/10 p-5 text-center">
          <p className="text-3xl" aria-hidden>
            📨
          </p>
          <p className="mt-1 text-lg font-bold">Request sent</p>
          <p className="mt-1 text-sm">
            {sent.teamName} for {event?.name}. The organiser has been notified; you&rsquo;ll see &ldquo;Approved&rdquo; on the meet page once
            they accept it.
          </p>
        </div>
        <Link href={`/meets/${meet.id}`} className="block rounded-xl bg-foreground py-3 text-center font-semibold text-background">
          See the meet
        </Link>
      </div>
    );
  }

  function choose(e: MeetEvent) {
    setEvent(e);
    setFormDone(false);
    setRows(Array.from({ length: START_ROWS[e.format] }, () => ({ name: "" })));
    setError(null);
  }

  async function submit() {
    if (!event) return;
    let reg: Registration;
    try {
      reg = createRegistration(meet, { eventId: event.id, captain: user!, teamName, players: rows, contact, note, formDone }, existing);
    } catch (e) {
      if (e instanceof MutationError) return setError(e.message);
      throw e;
    }
    setBusy(true);
    const err = await sendRegistration(reg);
    setBusy(false);
    if (err) setError(err);
    else setSent(reg);
  }

  const form = event && formFor(meet, event);
  return (
    <div className="space-y-5 pb-10">
      {back}
      <h1 className="text-xl font-bold">Register a team</h1>
      {meet.registration.info && <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-sm">{meet.registration.info}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">1. Which event?</h2>
        <div className="grid gap-2">
          {meet.events.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={event?.id === e.id}
              onClick={() => choose(e)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left ${event?.id === e.id ? "border-2 border-foreground" : "border-border bg-surface"}`}
            >
              <span className="text-2xl" aria-hidden>
                {SPORT_ICON[e.sport]}
              </span>
              <span className="font-medium">{e.name}</span>
            </button>
          ))}
        </div>
      </section>

      {event && form && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">2. Fill in the organiser&rsquo;s form</h2>
          <p className="text-sm text-muted">Player details and fees go here. It opens in a new tab; come back when you&rsquo;ve submitted it.</p>
          <a href={form} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-side-a py-3 text-center font-semibold text-white">
            Open the form ↗
          </a>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={formDone} onChange={(e) => setFormDone(e.target.checked)} />
            I have filled in and submitted the form
          </label>
        </section>
      )}

      {event && (!form || formDone) && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">{form ? "3" : "2"}. Your {event.format === "singles" ? "entry" : event.format === "doubles" ? "pair" : "team"}</h2>
          {event.format !== "singles" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{event.format === "doubles" ? "Pair name (optional)" : "Team name"}</span>
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={event.format === "doubles" ? "e.g. Meera / Karan" : "e.g. Smashers BC"} />
            </label>
          )}
          <div className="space-y-2">
            <span className="block text-sm font-medium">{event.format === "singles" ? "Player" : "Players"}</span>
            {rows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r.name}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder={`Player ${i + 1}`}
                  aria-label={`Player ${i + 1}`}
                />
                <CardPicker
                  name={r.name}
                  cardId={r.cardId}
                  sport={event.sport}
                  onPick={(p) => setRows(rows.map((x, j) => (j === i ? p : x)))}
                  onUnlink={() => setRows(rows.map((x, j) => (j === i ? { name: x.name } : x)))}
                />
              </div>
            ))}
            {event.format === "team" && (
              <button type="button" onClick={() => setRows([...rows, { name: "" }])} className="text-sm font-medium text-side-a">
                + Add player
              </button>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Other contact (optional)</span>
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. coach's phone number" />
            <span className="mt-1 block text-xs text-muted">The organiser already sees {user}.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Message to the organiser (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fee paid by UPI, ref 1234" />
          </label>
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <button type="button" disabled={busy} onClick={submit} className="w-full rounded-xl bg-foreground py-3 font-semibold text-background disabled:opacity-50">
            Send registration request
          </button>
        </section>
      )}
    </div>
  );
}
