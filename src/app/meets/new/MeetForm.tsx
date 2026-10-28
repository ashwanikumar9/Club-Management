"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { ActionBar, StepHeader } from "@/components/Wizard";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { createMeet, eventLabel, type NewEventInput } from "@/lib/meet/meet";
import { MutationError } from "@/lib/rally/mutations";
import { FORMAT_LABELS, SPORT_LIST, SPORTS, SPORT_ICON } from "@/lib/rally/sports";
import type { MatchFormat, SportKey } from "@/lib/rally/types";
import { TEMPLATES } from "@/lib/tournament/presets";
import { saveMeet, useUser } from "@/lib/store";

type Step = 1 | 2 | 3 | 4;
const TITLES: Record<Step, string> = { 1: "Sports meet details", 2: "Sports and events", 3: "Admins for each sport", 4: "Team registration" };

interface EventDraft extends NewEventInput {
  key: string;
  name: string;
  template: string;
  admins: string[];
}

/** Templates that make sense for an event: team ones only for team formats. */
function templatesFor(sport: SportKey, format: MatchFormat) {
  return TEMPLATES.filter((t) => t.sports.includes(sport) && (t.key !== "team_championship" || format === "team") && (t.key !== "beach" || format === "team"));
}

export function MeetForm() {
  const router = useRouter();
  const user = useUser();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [open, setOpen] = useState(true);
  const [formUrl, setFormUrl] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <div className="space-y-3 py-6 text-center">
        <h1 className="text-xl font-bold">New sports meet</h1>
        <p className="text-muted">Sign in first (top right). You become the organiser of meets you create.</p>
      </div>
    );
  }

  const has = (sport: SportKey, format: MatchFormat) => events.some((e) => e.sport === sport && e.format === format);
  function toggle(sport: SportKey, format: MatchFormat) {
    if (has(sport, format)) {
      setEvents(events.filter((e) => !(e.sport === sport && e.format === format)));
      return;
    }
    const template = format === "team" && sport !== "volleyball" ? "team_championship" : "championship";
    setEvents([...events, { key: crypto.randomUUID(), sport, format, name: eventLabel(sport, format), template, admins: [] }]);
  }
  const update = (key: string, change: Partial<EventDraft>) => setEvents(events.map((e) => (e.key === key ? { ...e, ...change } : e)));

  function next() {
    setError(null);
    if (step === 1 && !name.trim()) return setError("Give the sports meet a name.");
    if (step === 1 && endDate && startDate && endDate < startDate) return setError("The end date is before the start date.");
    if (step === 2 && events.length === 0) return setError("Pick at least one sport and format.");
    if (step < 4) setStep((step + 1) as Step);
  }

  function submit() {
    try {
      const r = createMeet({
        name,
        venue,
        city,
        startDate,
        endDate,
        organiser: user!,
        events: events.map(({ sport, format, name, template, admins }) => ({ sport, format, name, template, admins })),
        registration: { open, formUrl, info },
      });
      saveMeet(r.meet, r.tournaments);
      router.push(`/meets/${r.meet.id}`);
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  return (
    <div className="space-y-5">
      <StepHeader step={step} total={4} title={TITLES[step]} onBack={() => setStep((step - 1) as Step)} />

      {step === 1 && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inter-College Sports Meet 2026" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Venue</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main Ground" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Patna" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Starts</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Ends</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">The city puts the meet under &ldquo;Near you&rdquo; for people in that city.</p>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <p className="text-sm text-muted">Tap each sport and format you want. Every event becomes its own tournament.</p>
          {SPORT_LIST.map((s) => (
            <div key={s.key} className={`sport-${s.key} sport-soft rounded-2xl border p-4`}>
              <p className="flex items-center gap-2 font-semibold">
                <span className="text-2xl" aria-hidden>
                  {SPORT_ICON[s.key]}
                </span>
                {s.name}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {s.formats.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={has(s.key, f)}
                    onClick={() => toggle(s.key, f)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${has(s.key, f) ? "opt-on font-semibold" : "border-border"}`}
                  >
                    {has(s.key, f) ? "✓ " : ""}
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {events.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">Your events ({events.length})</h2>
              {events.map((e) => (
                <div key={e.key} className="space-y-2 rounded-xl border border-border bg-surface p-3">
                  <div className="flex gap-2">
                    <input value={e.name} onChange={(ev) => update(e.key, { name: ev.target.value })} aria-label="Event name" />
                    <button
                      type="button"
                      aria-label={`Remove ${e.name}`}
                      onClick={() => setEvents(events.filter((x) => x.key !== e.key))}
                      className="shrink-0 rounded-lg border border-border px-3 text-danger"
                    >
                      ✕
                    </button>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-muted">Format</span>
                    <select value={e.template} onChange={(ev) => update(e.key, { template: ev.target.value })} aria-label={`${e.name} format`}>
                      {templatesFor(e.sport, e.format).map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}: {t.who}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEvents([
                        ...events,
                        { ...e, key: crypto.randomUUID(), name: `${e.name} (2)`, admins: [] },
                      ])
                    }
                    className="text-xs font-medium text-side-a"
                  >
                    + Another {SPORTS[e.sport].name.toLowerCase()} {FORMAT_LABELS[e.format].toLowerCase()} event (e.g. women&rsquo;s, under-17)
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Optional. An admin runs one event like you do: approves its teams, sets up and schedules its fixtures, and can score. Leave it
            blank to run it yourself.
          </p>
          {events.map((e) => (
            <div key={e.key} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <p className="font-semibold">
                {SPORT_ICON[e.sport]} {e.name}
              </p>
              {e.admins.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {e.admins.map((a) => (
                    <li key={a} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                      {IDENTITY_ICON[identityKind(a)]} {a}
                      <button type="button" aria-label={`Remove ${a}`} onClick={() => update(e.key, { admins: e.admins.filter((x) => x !== a) })} className="px-2 text-muted">
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">No admin: you run this event.</p>
              )}
              <IdentityForm
                submitLabel="Add"
                onSubmit={(key) => {
                  if (key === user) return "You're the organiser already.";
                  if (e.admins.includes(key)) return "Already added.";
                  update(e.key, { admins: [...e.admins, key] });
                  return null;
                }}
              />
            </div>
          ))}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
            Teams can register through a link
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Google Form link (optional)</span>
            <input type="url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://forms.gle/…" />
            <span className="mt-1 block text-xs text-muted">
              Teams see this first and fill it in (player details, fees). Then they send their registration request here, and you
              approve it.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Information for teams (optional)</span>
            <textarea rows={3} value={info} onChange={(e) => setInfo(e.target.value)} placeholder="e.g. Fee ₹500 per team, pay by UPI to … · Last date 5 Nov" />
          </label>
        </section>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ActionBar>
        {step < 4 ? (
          <button type="button" onClick={next} className="btn-grad w-full rounded-xl py-3 font-semibold">
            Next{step === 2 && events.length ? ` (${events.length} event${events.length === 1 ? "" : "s"})` : ""}
          </button>
        ) : (
          <button type="button" onClick={submit} className="btn-grad w-full rounded-xl py-3 font-semibold">
            Create sports meet
          </button>
        )}
      </ActionBar>
    </div>
  );
}
