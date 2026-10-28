"use client";

import Link from "next/link";
import { use, useState, useSyncExternalStore } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { emptyPlayer, PlayerInput, resolvePlayers, type PlayerDraft } from "@/components/PlayerInput";
import { Sheet } from "@/components/Sheet";
import { COUNTRIES, DEFAULT_COUNTRY, parseIdentity } from "@/lib/identity";
import { initials } from "@/lib/players/cards";
import { SPORT_ICON, SPORTS } from "@/lib/rally/sports";
import { ensureCards, updateTeam, usePlayerContacts, useTeam, useUser } from "@/lib/store";
import {
  addMembers,
  canManageTeam,
  parseSquadList,
  removeMember,
  renameTeam,
  resetInvite,
  setCaptain,
  setJersey,
  setTeamAdmins,
  type Team,
  type TeamMember,
} from "@/lib/teams/teams";

const noop = () => () => {};

export function TeamView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const team = useTeam(id);
  if (team === undefined) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (team === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This team does not exist.</p>
        <Link href="/teams" className="mt-3 inline-block font-medium text-side-a underline">
          All teams
        </Link>
      </div>
    );
  return <View team={team} />;
}

type Panel = "add" | "paste" | "admins" | "edit" | null;

function View({ team }: { team: Team }) {
  const user = useUser();
  const contacts = usePlayerContacts();
  const admin = canManageTeam(team, user);
  const [panel, setPanel] = useState<Panel>(null);
  const [member, setMember] = useState<TeamMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captain = team.players.find((p) => p.cardId === team.captainCardId);
  const mine = !!user && team.players.some((p) => contacts.some((c) => c.playerId === p.cardId && c.contact === user));
  const sorted = [...team.players].sort((a, b) => Number(b.cardId === team.captainCardId) - Number(a.cardId === team.captainCardId));

  return (
    <div className="space-y-5 pb-10">
      <Link href="/teams" className="text-sm font-medium text-side-a">
        ← Teams
      </Link>
      <div className={`sport-${team.sport} sport-tile flex items-center gap-3 rounded-2xl p-4`}>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/20 text-2xl font-bold" aria-hidden>
          {initials(team.name) || SPORT_ICON[team.sport]}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{team.name}</h1>
          <p className="text-sm opacity-90">
            {[`${SPORT_ICON[team.sport]} ${SPORTS[team.sport].name}`, team.city, `${team.players.length} player${team.players.length === 1 ? "" : "s"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {captain && <p className="text-sm opacity-90">Captain {captain.name}</p>}
        </div>
      </div>

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error} <span className="float-right">✕</span>
        </button>
      )}

      {admin ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPanel("add")} className="btn-grad rounded-xl py-3 font-semibold">
              + Add players
            </button>
            <button type="button" onClick={() => setPanel("paste")} className="rounded-xl border border-border bg-surface py-3 font-semibold">
              Paste a list
            </button>
          </div>
          <InviteLink team={team} user={user!} setError={setError} />
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-3 text-sm text-muted">
          {mine
            ? "You're in this team. Your results in its matches go to your player card."
            : "Want to play for this team? Ask the captain for the invite link, or to add you with your mobile number."}
        </p>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Squad</h2>
        {sorted.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">
            No players yet.{admin && " Add them by name and mobile number, paste a list, or share the invite link."}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {sorted.map((p) => (
              <li key={p.cardId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="tabular w-8 shrink-0 text-center text-sm font-semibold text-muted">{p.jersey ? `#${p.jersey}` : ""}</span>
                <Link href={`/players/${p.cardId}`} className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                </Link>
                {p.cardId === team.captainCardId && <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">C</span>}
                {admin && (
                  <button type="button" onClick={() => setMember(p)} aria-label={`Edit ${p.name}`} className="shrink-0 px-2 text-muted">
                    ⋯
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && (
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => setPanel("edit")} className="rounded-full border border-border px-3 py-1.5">
            Edit name / city
          </button>
          {team.organiser === user && (
            <button type="button" onClick={() => setPanel("admins")} className="rounded-full border border-border px-3 py-1.5">
              Team admins ({team.scorers.length})
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-muted">Created by {team.organiser}</p>

      {panel === "add" && <AddPlayers team={team} user={user!} onClose={() => setPanel(null)} />}
      {panel === "paste" && <PasteList team={team} user={user!} onClose={() => setPanel(null)} />}
      {panel === "admins" && <AdminsSheet team={team} user={user!} onClose={() => setPanel(null)} />}
      {panel === "edit" && <EditSheet team={team} user={user!} onClose={() => setPanel(null)} />}
      {member && <MemberSheet team={team} member={member} user={user!} onClose={() => setMember(null)} />}
    </div>
  );
}

function InviteLink({ team, user, setError }: { team: Team; user: string; setError: (e: string | null) => void }) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const link = `${origin}/teams/${team.id}/join/${team.inviteCode}`;
  const message = `Join ${team.name} (${SPORTS[team.sport].name}) on Rally Scorer: ${link}`;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-sm font-semibold">Invite link</p>
      <p className="text-xs text-muted">Players open it, sign in with their mobile number and join straight away.</p>
      <p className="mt-2 select-all break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{link}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
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
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-border py-2 text-center text-sm font-medium"
        >
          WhatsApp
        </a>
        <button
          type="button"
          onClick={() => {
            if (confirm("Make a new link? The current link will stop working.")) setError(updateTeam(team.id, (t) => resetInvite(t, user)));
          }}
          className="rounded-xl border border-border py-2 text-sm font-medium"
        >
          New link
        </button>
      </div>
    </div>
  );
}

function AddPlayers({ team, user, onClose }: { team: Team; user: string; onClose: () => void }) {
  const [rows, setRows] = useState<PlayerDraft[]>([emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await resolvePlayers(
      rows.map((draft, i) => ({ draft, label: `player ${i + 1}` })),
      user,
      team.sport,
    );
    setBusy(false);
    if ("error" in r) return setError(r.error);
    if (r.players.length === 0) return setError("Enter at least one player's name and mobile number.");
    const err = updateTeam(team.id, (t) => addMembers(t, user, r.players));
    if (err) return setError(err);
    onClose();
  }

  return (
    <Sheet title={`Add players · ${team.name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">
        Name and mobile number for each player. If they already have a player card, it&rsquo;s used; otherwise one is made and becomes theirs when they sign
        in with that number.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <PlayerInput key={i} value={row} onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))} label={`Player ${i + 1}`} sport={team.sport} jersey />
        ))}
      </div>
      <button type="button" onClick={() => setRows([...rows, emptyPlayer()])} className="mt-2 text-sm font-medium text-side-a">
        + Another player
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="btn-grad mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-60">
        {busy ? "Saving…" : "Add to squad"}
      </button>
    </Sheet>
  );
}

function PasteList({ team, user, onClose }: { team: Team; user: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const { rows, errors } = parseSquadList(text);
    const problems = [...errors];
    const parsed: { name: string; contact: string }[] = [];
    for (const r of rows) {
      const id = parseIdentity(r.contact, country, false);
      if (id.ok) parsed.push({ name: r.name, contact: id.key });
      else problems.push(`${r.name}: ${id.error}`);
    }
    if (problems.length) return setError(problems.join("\n"));
    if (parsed.length === 0) return setError("Paste one player per line: name, mobile number.");
    setBusy(true);
    try {
      const players = await ensureCards(parsed, user, team.sport);
      const err = updateTeam(team.id, (t) => addMembers(t, user, players));
      if (err) return setError(err);
      onClose();
    } catch (e) {
      setError(`Couldn't save the players: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Paste a list · ${team.name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">One player per line: name, then mobile number (or email). Copying two columns from a spreadsheet works too.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        aria-label="Squad list"
        placeholder={"Riya Sharma, 98765 43210\nArjun Mehta, 91234 56789"}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
      />
      <label className="mt-2 flex items-center gap-2 text-sm">
        Numbers without a country code are
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="!w-auto" aria-label="Default country code">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              +{c.code} {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="mt-2 whitespace-pre-line text-sm text-danger">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="btn-grad mt-3 w-full rounded-xl py-3 font-semibold disabled:opacity-60">
        {busy ? "Saving…" : "Add to squad"}
      </button>
    </Sheet>
  );
}

function MemberSheet({ team, member, user, onClose }: { team: Team; member: TeamMember; user: string; onClose: () => void }) {
  const [jersey, setJerseyValue] = useState(member.jersey ?? "");
  const [error, setError] = useState<string | null>(null);
  const isCaptain = team.captainCardId === member.cardId;
  const run = (mutate: (t: Team) => Team) => {
    const err = updateTeam(team.id, mutate);
    setError(err);
    if (!err) onClose();
  };
  return (
    <Sheet title={member.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={jersey} onChange={(e) => setJerseyValue(e.target.value)} placeholder="Jersey number" aria-label="Jersey number" inputMode="numeric" />
          <button type="button" onClick={() => run((t) => setJersey(t, user, member.cardId, jersey))} className="shrink-0 rounded-xl border border-border px-4 font-medium">
            Save
          </button>
        </div>
        <button
          type="button"
          onClick={() => run((t) => setCaptain(t, user, isCaptain ? undefined : member.cardId))}
          className={`w-full rounded-xl py-2.5 font-medium ${isCaptain ? "border border-border" : "btn-grad"}`}
        >
          {isCaptain ? "Remove as captain" : "Make captain"}
        </button>
        <Link href={`/players/${member.cardId}`} className="block w-full rounded-xl border border-border py-2.5 text-center font-medium">
          Player card
        </Link>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remove ${member.name} from ${team.name}?`)) run((t) => removeMember(t, user, member.cardId));
          }}
          className="w-full rounded-xl py-2.5 font-medium text-danger"
        >
          Remove from team
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function AdminsSheet({ team, user, onClose }: { team: Team; user: string; onClose: () => void }) {
  const [admins, setAdmins] = useState(team.scorers);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`Admins · ${team.name}`} onClose={onClose}>
      <p className="mb-2 text-sm text-muted">Admins add and remove players, pick the captain and enter the team in events. Add them by mobile number or email.</p>
      <ul className="mb-2 flex flex-wrap gap-2">
        {admins.map((a) => (
          <li key={a} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
            {a}
            <button type="button" aria-label={`Remove ${a}`} onClick={() => setAdmins(admins.filter((x) => x !== a))} className="px-2 text-muted">
              ✕
            </button>
          </li>
        ))}
        {admins.length === 0 && <li className="text-sm text-muted">Only you.</li>}
      </ul>
      <IdentityForm
        submitLabel="Add"
        allowUsername={false}
        onSubmit={(key) => {
          if (key === team.organiser) return "You created the team already.";
          if (admins.includes(key)) return "Already added.";
          setAdmins([...admins, key]);
          return null;
        }}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => {
          const err = updateTeam(team.id, (t) => setTeamAdmins(t, user, admins));
          setError(err);
          if (!err) onClose();
        }}
        className="btn-grad mt-3 w-full rounded-xl py-3 font-semibold"
      >
        Save admins
      </button>
    </Sheet>
  );
}

function EditSheet({ team, user, onClose }: { team: Team; user: string; onClose: () => void }) {
  const [name, setName] = useState(team.name);
  const [city, setCity] = useState(team.city);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title="Edit team" onClose={onClose}>
      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" aria-label="Team name" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City" />
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => {
          const err = updateTeam(team.id, (t) => renameTeam(t, user, name, city));
          setError(err);
          if (!err) onClose();
        }}
        className="btn-grad mt-3 w-full rounded-xl py-3 font-semibold"
      >
        Save
      </button>
    </Sheet>
  );
}
