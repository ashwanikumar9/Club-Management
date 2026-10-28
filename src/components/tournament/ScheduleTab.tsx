"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { Data } from "@/lib/tournament/engine";
import { fixtureLabel } from "@/lib/tournament/mutations";
import {
  autoSchedule,
  formatSchedule,
  importSchedule,
  scheduleKey,
  scheduleText,
  setFixtureSchedule,
} from "@/lib/tournament/schedule";
import { isByeFixture } from "@/lib/tournament/engine";
import type { Fixture, Tournament } from "@/lib/tournament/types";
import { runTournamentAction } from "@/lib/store";
import { FixtureCard, entryName } from "./parts";

const today = () => new Date().toISOString().slice(0, 10);

/** Fixtures by day and time, with the organiser's scheduling tools. */
export function ScheduleTab({ t, data, organiser, user }: { t: Tournament; data: Data; organiser: boolean; user: string }) {
  const [editing, setEditing] = useState<Fixture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fixtures = t.fixtures.filter((f) => !isByeFixture(f)).sort((a, b) => scheduleKey(a.schedule).localeCompare(scheduleKey(b.schedule)));

  const days = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const key = f.schedule?.date ?? (f.schedule?.time ? "Undated" : "Not scheduled yet");
    days.set(key, [...(days.get(key) ?? []), f]);
  }

  async function copy() {
    const text = scheduleText(t, data, (id) => entryName(t, id));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copying isn't allowed here. Select the schedule on the page and copy it instead.");
    }
  }

  return (
    <div className="space-y-4">
      {organiser && <ScheduleTools t={t} user={user} setError={setError} />}
      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error}
        </button>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
          {copied ? "Copied" : "Copy schedule as text"}
        </button>
      </div>
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {/^\d{4}-/.test(day) ? formatSchedule({ date: day }) : day}
          </h2>
          <ul className="space-y-2">
            {list.map((f) => (
              <li key={f.id} className="flex items-stretch gap-2">
                <div className="tabular w-16 shrink-0 pt-2 text-sm">
                  <div className="font-semibold">{f.schedule?.time ?? "—"}</div>
                  <div className="truncate text-xs text-muted">{f.schedule?.court ?? ""}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <FixtureCard t={t} fixture={f} data={data} showSchedule={false} />
                </div>
                {organiser && (
                  <button
                    type="button"
                    onClick={() => setEditing(f)}
                    aria-label={`Change time for ${fixtureLabel(t, f)}`}
                    className="shrink-0 rounded-lg border border-border px-2 text-sm"
                  >
                    🕑
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editing && <EditSchedule t={t} fixture={editing} user={user} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ScheduleTools({ t, user, setError }: { t: Tournament; user: string; setError: (e: string | null) => void }) {
  const [date, setDate] = useState(t.startDate || today());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [minutes, setMinutes] = useState("30");
  const [rest, setRest] = useState("1");
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(false);
  const [courtText, setCourtText] = useState(t.courts.join(", "));
  const [importText, setImportText] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const courts = courtText.split(",").map((c) => c.trim()).filter(Boolean);

  return (
    <div className="space-y-3">
      <details className="rounded-2xl border border-border bg-surface p-4" open={!t.fixtures.some((f) => f.schedule)}>
        <summary className="cursor-pointer font-semibold">Auto-schedule</summary>
        <p className="mt-1 text-xs text-muted">
          Spreads matches across the courts, never puts a player on two courts at once, gives them a rest between matches, and
          plays knockout rounds after the matches that decide them.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="col-span-2 block text-sm sm:col-span-3">
            <span className="mb-1 block font-medium">Courts / tables (comma separated)</span>
            <input value={courtText} onChange={(e) => setCourtText(e.target.value)} placeholder="Court 1, Court 2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">First day</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">First match</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Last start</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Minutes per match</span>
            <input type="number" inputMode="numeric" min={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Rest (matches)</span>
            <select value={rest} onChange={(e) => setRest(e.target.value)}>
              <option value="0">No rest needed</option>
              <option value="1">At least 1 match off</option>
              <option value="2">At least 2 matches off</option>
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyUnscheduled} onChange={(e) => setOnlyUnscheduled(e.target.checked)} />
          Keep matches that already have a time
        </label>
        <button
          type="button"
          onClick={() => {
            setDone(null);
            const err = runTournamentAction(t.id, (x, all) => {
              const r = autoSchedule(x, user, all, {
                date,
                startTime,
                endTime,
                minutesPerMatch: Number(minutes),
                courts,
                restSlots: Number(rest),
                onlyUnscheduled,
              });
              return { item: r.tournament, matches: r.matches, ties: r.ties };
            });
            setError(err);
            if (!err) setDone("Schedule created.");
          }}
          className="btn-grad mt-3 w-full rounded-xl py-2.5 font-semibold"
        >
          Auto-schedule
        </button>
        {done && <p className="mt-2 text-sm text-accent">{done}</p>}
      </details>

      <details className="rounded-2xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Import from a spreadsheet</summary>
        <p className="mt-1 text-xs text-muted">
          Paste rows from Excel or Google Sheets (or type them): <code>Team A vs Team B, date, time, court</code>. Dates as
          2026-11-07 or 07/11/2026, times as 14:30 or 2:30 pm. Rows are matched to fixtures by the two names.
        </p>
        <textarea
          rows={4}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"Eagles vs Hawks, 07/11/2026, 10:00, Court 1\nLions vs Tigers, 07/11/2026, 10:00, Court 2"}
          aria-label="Schedule rows"
          className="mt-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => {
            const err = runTournamentAction(t.id, (x, all) => {
              const r = importSchedule(x, user, all, importText);
              return { item: r.tournament, matches: r.matches, ties: r.ties };
            });
            setError(err);
            if (!err) setImportText("");
          }}
          className="mt-2 w-full rounded-xl border border-border py-2.5 font-semibold"
        >
          Import schedule
        </button>
      </details>
    </div>
  );
}

function EditSchedule({ t, fixture, user, onClose }: { t: Tournament; fixture: Fixture; user: string; onClose: () => void }) {
  const [date, setDate] = useState(fixture.schedule?.date ?? t.startDate ?? "");
  const [time, setTime] = useState(fixture.schedule?.time ?? "");
  const [court, setCourt] = useState(fixture.schedule?.court ?? t.courts[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const listId = `courts-${fixture.id}`;

  const save = (clear = false) => {
    const err = runTournamentAction(t.id, (x, all) => {
      const r = setFixtureSchedule(x, user, all, fixture.id, clear ? {} : { date, time, court });
      return { item: r.tournament, matches: r.matches, ties: r.ties };
    });
    setError(err);
    if (!err) onClose();
  };

  return (
    <Sheet title={`When: ${fixtureLabel(t, fixture)}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Time</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="col-span-2 block text-sm">
          <span className="mb-1 block font-medium">Court / table</span>
          <input list={listId} value={court} onChange={(e) => setCourt(e.target.value)} />
          <datalist id={listId}>
            {t.courts.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => save(true)} className="rounded-xl border border-border py-3 font-medium">
          Clear time
        </button>
        <button type="button" onClick={() => save()} className="btn-grad rounded-xl py-3 font-bold">
          Save
        </button>
      </div>
    </Sheet>
  );
}
