"use client";

import Link from "next/link";
import { use, useEffect, useState, useSyncExternalStore } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { Sheet } from "@/components/Sheet";
import { SPORT_ICON } from "@/app/matches/new/NewMatchForm";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { addMeetEvent, canManageEvent, canManageMeet, formFor, managedEvents, removeMeetEvent, setEventAdmins, updateMeet as changeMeet } from "@/lib/meet/meet";
import { approveRegistration, rejectRegistration } from "@/lib/meet/registration";
import type { Meet, MeetEvent, Registration } from "@/lib/meet/types";
import { MutationError } from "@/lib/rally/mutations";
import { FORMAT_LABELS, SPORT_LIST } from "@/lib/rally/sports";
import type { MatchFormat, SportKey } from "@/lib/rally/types";
import { rememberVisit } from "@/lib/recent";
import { champion, type Data } from "@/lib/tournament/engine";
import type { Tournament } from "@/lib/tournament/types";
import {
  decideRegistration,
  runMeetAction,
  updateMeet,
  useMatches,
  useMeet,
  useRegistrations,
  useTies,
  useTournaments,
  useUser,
  withdrawRegistration,
} from "@/lib/store";

const PHASE: Record<Tournament["phase"], string> = { setup: "Taking entries", groups: "Group stage", knockout: "Knockout", complete: "Finished" };
const noop = () => () => {};

export function MeetView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const meet = useMeet(id);
  const tournaments = useTournaments();
  const matches = useMatches();
  const ties = useTies();
  useEffect(() => rememberVisit("meet", id), [id]);
  if (meet === undefined || !tournaments || !matches || !ties) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (meet === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This sports meet does not exist.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-side-a underline">
          Back home
        </Link>
      </div>
    );
  return <View meet={meet} tournaments={tournaments} data={{ matches, ties }} />;
}

function View({ meet, tournaments, data }: { meet: Meet; tournaments: Record<string, Tournament>; data: Data }) {
  const user = useUser();
  const regs = useRegistrations().filter((r) => r.meetId === meet.id);
  const organiser = canManageMeet(meet, user);
  const managed = managedEvents(meet, user);
  const mine = regs.filter((r) => r.captain === user);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [adminsFor, setAdminsFor] = useState<MeetEvent | null>(null);
  const [settings, setSettings] = useState(false);
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const link = `${origin}/meets/${meet.id}/register`;
  const dates = meet.endDate && meet.endDate !== meet.startDate ? `${meet.startDate} – ${meet.endDate}` : meet.startDate;

  return (
    <div className="space-y-5 pb-10">
      <div>
        <p className="text-sm text-muted">{["Sports meet", dates, [meet.venue, meet.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
        <h1 className="text-xl font-bold">{meet.name}</h1>
        <p className="mt-0.5 text-xs text-muted">Organiser {meet.organiser}</p>
      </div>

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error} <span className="float-right">✕</span>
        </button>
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Team registration</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meet.registration.open ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"}`}>
            {meet.registration.open ? "Open" : "Closed"}
          </span>
        </div>
        {meet.registration.info && <p className="mt-2 whitespace-pre-wrap text-sm">{meet.registration.info}</p>}
        {meet.registration.open && (
          <>
            <Link href={`/meets/${meet.id}/register`} className="mt-3 block rounded-xl bg-foreground py-3 text-center font-semibold text-background">
              Register a team
            </Link>
            <ShareLink link={link} name={meet.name} />
          </>
        )}
        {organiser && (
          <button type="button" onClick={() => setSettings(true)} className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-medium">
            Registration settings
          </button>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Your registrations</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.teamName} · {meet.events.find((e) => e.id === r.eventId)?.name ?? "Event removed"}
                  </span>
                  <StatusPill status={r.status} />
                </div>
                {r.reason && <p className="mt-1 text-muted">Reason: {r.reason}</p>}
                {r.status === "pending" && (
                  <button
                    type="button"
                    onClick={async () => setError(await withdrawRegistration(r.id))}
                    className="mt-2 text-xs font-medium text-danger underline"
                  >
                    Withdraw request
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {managed.length > 0 && <Requests meet={meet} regs={regs.filter((r) => managed.some((e) => e.id === r.eventId))} user={user!} setError={setError} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Events</h2>
          {organiser && (
            <button type="button" onClick={() => setAdding(true)} className="text-sm font-medium text-side-a">
              + Add event
            </button>
          )}
        </div>
        <ul className="space-y-2">
          {meet.events.map((e) => {
            const t = tournaments[e.tournamentId];
            const winner = t && champion(t, data);
            const waiting = regs.filter((r) => r.eventId === e.id && r.status === "pending").length;
            return (
              <li key={e.id} className="rounded-2xl border border-border bg-surface">
                <Link href={`/tournaments/${e.tournamentId}`} className="flex items-center gap-3 p-4">
                  <span className="text-3xl" aria-hidden>
                    {SPORT_ICON[e.sport]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.name}</span>
                    <span className="block text-sm text-muted">
                      {t ? `${t.entries.length} ${e.format === "singles" ? "players" : e.format === "doubles" ? "pairs" : "teams"} · ${PHASE[t.phase]}` : "Loading…"}
                      {canManageEvent(meet, e, user) && waiting > 0 && <span className="ml-2 font-semibold text-live">{waiting} waiting</span>}
                    </span>
                    {winner && <span className="block text-sm font-semibold text-accent">🏆 {t!.entries.find((x) => x.id === winner)?.name}</span>}
                  </span>
                  <span className="text-muted">›</span>
                </Link>
                <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted">
                  <span>Admins: {e.admins.length ? e.admins.join(", ") : "organiser"}</span>
                  {organiser && (
                    <>
                      <button type="button" onClick={() => setAdminsFor(e)} className="ml-auto font-medium text-side-a">
                        Change admins
                      </button>
                      <button
                        type="button"
                        onClick={() => setError(runMeetAction(meet.id, (m, all) => ({ meet: removeMeetEvent(m, user!, e.id, all[e.tournamentId]), deleteTournament: e.tournamentId })))}
                        className="font-medium text-danger"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {adding && <AddEvent meet={meet} user={user!} onClose={() => setAdding(false)} setError={setError} />}
      {adminsFor && <AdminsSheet meet={meet} event={adminsFor} user={user!} onClose={() => setAdminsFor(null)} />}
      {settings && <SettingsSheet meet={meet} user={user!} onClose={() => setSettings(false)} />}
    </div>
  );
}

function StatusPill({ status }: { status: Registration["status"] }) {
  const style = status === "approved" ? "bg-accent/15 text-accent" : status === "rejected" ? "bg-danger/10 text-danger" : "bg-live/10 text-live";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{status === "pending" ? "Waiting" : status === "approved" ? "Approved" : "Rejected"}</span>;
}

function ShareLink({ link, name }: { link: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const message = `Register your team for ${name}: ${link}`;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-muted">Share this link with teams:</p>
      <p className="select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{link}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(message).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            )
          }
          className="rounded-xl border border-border py-2 text-sm font-medium"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-border py-2 text-center text-sm font-medium">
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Pending requests for the events this person runs, with approve / reject, and past decisions. */
function Requests({ meet, regs, user, setError }: { meet: Meet; regs: Registration[]; user: string; setError: (e: string | null) => void }) {
  const pending = regs.filter((r) => r.status === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = regs.filter((r) => r.status !== "pending");
  const [rejecting, setRejecting] = useState<Registration | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(r: Registration) {
    const event = meet.events.find((e) => e.id === r.eventId)!;
    setBusy(r.id);
    setError(
      await decideRegistration(
        r,
        (reg, t) => {
          if (!t) throw new MutationError("This event's tournament hasn't loaded yet. Try again in a moment.");
          return approveRegistration(meet, reg, t, user);
        },
        event.tournamentId,
      ),
    );
    setBusy(null);
  }

  return (
    <section id="requests" className="scroll-mt-20">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Registration requests {pending.length > 0 && <span className="text-live">({pending.length} waiting)</span>}</h2>
      {pending.length === 0 && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">No requests waiting.</p>}
      <ul className="space-y-2">
        {pending.map((r) => {
          const event = meet.events.find((e) => e.id === r.eventId);
          return (
            <li key={r.id} className="rounded-2xl border-2 border-live/40 bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{r.teamName}</p>
                  <p className="text-sm text-muted">{event?.name}</p>
                </div>
                <StatusPill status={r.status} />
              </div>
              <p className="mt-2 text-sm">Players: {r.players.map((p) => p.name).join(", ")}</p>
              <p className="mt-1 text-sm">
                Contact: {IDENTITY_ICON[identityKind(r.captain)]} {r.captain}
                {r.contact && ` · ${r.contact}`}
              </p>
              {event && formFor(meet, event) && <p className="mt-1 text-sm">{r.formDone ? "✓ Says the form is filled in" : "Form not confirmed"}</p>}
              {r.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">“{r.note}”</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRejecting(r)} className="rounded-xl border border-border py-2.5 text-sm font-medium">
                  Reject
                </button>
                <button type="button" disabled={busy === r.id} onClick={() => approve(r)} className="rounded-xl bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  Approve
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {decided.length > 0 && (
        <details className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium">Decided ({decided.length})</summary>
          <ul className="mt-2 divide-y divide-border">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  {r.teamName} · {meet.events.find((e) => e.id === r.eventId)?.name}
                  {r.reason && <span className="text-muted"> · {r.reason}</span>}
                </span>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {rejecting && (
        <Sheet title={`Reject ${rejecting.teamName}?`} onClose={() => setRejecting(null)}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Reason (shown to the team)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Fee not received" />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRejecting(null)} className="rounded-xl border border-border py-2.5 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setError(await decideRegistration(rejecting, (reg) => ({ registration: rejectRegistration(meet, reg, user, reason) })));
                setRejecting(null);
                setReason("");
              }}
              className="rounded-xl bg-danger py-2.5 text-sm font-semibold text-white"
            >
              Reject
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function AddEvent({ meet, user, onClose, setError }: { meet: Meet; user: string; onClose: () => void; setError: (e: string | null) => void }) {
  const [sport, setSport] = useState<SportKey>("badminton");
  const [format, setFormat] = useState<MatchFormat>("singles");
  const [name, setName] = useState("");
  const formats = SPORT_LIST.find((s) => s.key === sport)!.formats;
  return (
    <Sheet title="Add an event" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {SPORT_LIST.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSport(s.key);
                if (!s.formats.includes(format)) setFormat(s.formats[0]);
              }}
              className={`rounded-xl border py-2 text-sm ${sport === s.key ? "border-foreground font-semibold" : "border-border"}`}
            >
              {SPORT_ICON[s.key]} {s.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {formats.map((f) => (
            <button key={f} type="button" onClick={() => setFormat(f)} className={`flex-1 rounded-lg border py-2 text-sm ${format === f ? "border-foreground font-semibold" : "border-border"}`}>
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional), e.g. Women's singles" aria-label="Event name" />
        <button
          type="button"
          onClick={() => {
            const err = runMeetAction(meet.id, (m) => {
              const r = addMeetEvent(m, user, { sport, format, name, template: format === "team" && sport !== "volleyball" ? "team_championship" : "championship" });
              return { meet: r.meet, newTournament: r.tournament };
            });
            setError(err);
            if (!err) onClose();
          }}
          className="w-full rounded-xl bg-foreground py-3 font-semibold text-background"
        >
          Add event
        </button>
      </div>
    </Sheet>
  );
}

function AdminsSheet({ meet, event, user, onClose }: { meet: Meet; event: MeetEvent; user: string; onClose: () => void }) {
  const [admins, setAdmins] = useState(event.admins);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`Admins · ${event.name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">Admins approve this event&rsquo;s teams, set up its fixtures and can score its matches.</p>
      <ul className="mb-2 flex flex-wrap gap-2">
        {admins.map((a) => (
          <li key={a} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
            {a}
            <button type="button" aria-label={`Remove ${a}`} onClick={() => setAdmins(admins.filter((x) => x !== a))} className="px-2 text-muted">
              ✕
            </button>
          </li>
        ))}
        {admins.length === 0 && <li className="text-sm text-muted">None: you run this event.</li>}
      </ul>
      <IdentityForm
        submitLabel="Add"
        onSubmit={(key) => {
          if (key === meet.organiser) return "You're the organiser already.";
          if (admins.includes(key)) return "Already added.";
          setAdmins([...admins, key]);
          return null;
        }}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => {
          const err = runMeetAction(meet.id, (m, all) => {
            const t = all[event.tournamentId];
            if (!t) throw new MutationError("This event's tournament hasn't loaded yet.");
            return setEventAdmins(m, user, event.id, admins, t);
          });
          setError(err);
          if (!err) onClose();
        }}
        className="mt-4 w-full rounded-xl bg-foreground py-3 font-semibold text-background"
      >
        Save admins
      </button>
    </Sheet>
  );
}

function SettingsSheet({ meet, user, onClose }: { meet: Meet; user: string; onClose: () => void }) {
  const [open, setOpen] = useState(meet.registration.open);
  const [formUrl, setFormUrl] = useState(meet.registration.formUrl ?? "");
  const [info, setInfo] = useState(meet.registration.info ?? "");
  const [city, setCity] = useState(meet.city);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Registration settings" onClose={onClose}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          Registration open
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Google Form link</span>
          <input type="url" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://forms.gle/…" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Information for teams</span>
          <textarea rows={3} value={info} onChange={(e) => setInfo(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">City</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={() => {
            const err = updateMeet(meet.id, (m) => changeMeet(m, user, { city, registration: { open, formUrl, info } }));
            setError(err);
            if (!err) onClose();
          }}
          className="w-full rounded-xl bg-foreground py-3 font-semibold text-background"
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
