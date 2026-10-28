"use client";

import { EmailReportButton } from "@/components/Reports";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { rememberVisit } from "@/lib/recent";
import { IdentityForm } from "@/components/IdentityForm";
import { cardPlayer, emptyPlayer, PlayerInput, resolveListed, resolvePlayers, type PlayerDraft } from "@/components/PlayerInput";
import { TeamPicker } from "@/components/TeamBits";
import { Bracket, PointsTable, entryName } from "@/components/tournament/parts";
import { ScheduleTab } from "@/components/tournament/ScheduleTab";
import { AddMatch, EditFixtureSheet, FixtureList, RoundsTab } from "@/components/tournament/RoundsTab";
import { addEntries, parseBulkEntries } from "@/lib/tournament/schedule";
import { FORMAT_LABELS, SPORTS } from "@/lib/rally/sports";
import { describeRules } from "@/lib/rally/rules";
import { fixtureOutcome, groupStageComplete, isMain, podium, type Data } from "@/lib/tournament/engine";
import {
  addEntry,
  addTournamentScorer,
  assignToGroup,
  autoAssignGroups,
  generateFixtures,
  removeEntry,
  removeTournamentScorer,
  renameGroup,
  setGroupCount,
  setLegs,
  setQualifiers,
  setRanking,
  setSeed,
  setStructure,
  setThirdPlace,
  startKnockout,
  canManageTournament,
} from "@/lib/tournament/mutations";
import type { Fixture, Tournament } from "@/lib/tournament/types";
import { runTournamentAction, updateTournament, useMatches, useTies, useTournament, useUser } from "@/lib/store";
import { tieSystem } from "@/lib/tie/systems";
import { suggestedGroups, suggestedSeeds } from "@/lib/tournament/presets";
import { RANKINGS, type RankingKey } from "@/lib/tournament/ranking";
import { STRUCTURES, rankingChoices } from "../new/TournamentForm";

type Tab = "entries" | "groups" | "fixtures" | "schedule" | "bracket" | "rounds";

export function TournamentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTournament(id);
  const matches = useMatches();
  useEffect(() => rememberVisit("tournament", id), [id]);
  const ties = useTies();
  if (t === undefined || matches === null || ties === null) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (t === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This tournament does not exist on this device.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-side-a underline">
          Back home
        </Link>
      </div>
    );
  return <View t={t} data={{ matches, ties }} />;
}

function View({ t, data }: { t: Tournament; data: Data }) {
  const user = useUser();
  const organiser = canManageTournament(t, user);
  const setup = t.phase === "setup";
  const tabs: { key: Tab; label: string }[] = [
    { key: "entries", label: `Entries (${t.entries.length})` },
    ...(t.structure !== "knockout" ? [{ key: "groups" as const, label: t.structure === "league" ? "Table" : "Groups" }] : []),
    ...(!setup ? [{ key: "fixtures" as const, label: "Fixtures" }] : []),
    ...(t.structure !== "league" && !setup ? [{ key: "bracket" as const, label: "Bracket" }] : []),
    ...(!setup ? [{ key: "schedule" as const, label: "Schedule" }] : []),
    ...(!setup && (organiser || (t.stages ?? []).length > 0) ? [{ key: "rounds" as const, label: "More rounds" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(setup ? "entries" : t.structure === "knockout" ? "bracket" : "groups");
  const active = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Fixture | null>(null);
  const run = (action: Parameters<typeof runTournamentAction>[1]) => {
    const err = runTournamentAction(t.id, action);
    setError(err);
    return err;
  };
  const edit = (mutate: (x: Tournament) => Tournament) => {
    const err = updateTournament(t.id, mutate);
    setError(err);
    return err;
  };

  const top = podium(t, data);
  const sport = SPORTS[t.sport];

  return (
    <div className="space-y-4 pb-10">
      <div>
        {t.meet && (
          <Link href={`/meets/${t.meet.id}`} className="text-sm font-medium text-side-a">
            ← {t.meet.name}
          </Link>
        )}
        <p className="text-sm text-muted">
          {[sport.name, FORMAT_LABELS[t.format], STRUCTURES.find((s) => s.key === t.structure)?.title, t.venue, t.startDate]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="text-xl font-bold">{t.name}</h1>
        <p className="mt-0.5 text-xs text-muted">
          Organiser {t.organiser}
          {(t.admins ?? []).length > 0 && ` · Admins ${t.admins!.join(", ")}`} · {describeRules(t.rules, sport.setLabel)}
          {tieSystem(t.tieSystem) && ` · ${tieSystem(t.tieSystem)!.label} ties`}
          {t.structure !== "knockout" && ` · ${RANKINGS[t.ranking ?? "custom"].label} table`}
          {t.structure !== "knockout" && (t.legs ?? 1) === 2 && " · home and away"}
        </p>
      </div>

      {top.first && (
        <div className="rounded-2xl border-2 border-accent bg-accent/10 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Champion</p>
          <p className="text-2xl font-black">🏆 {entryName(t, top.first)}</p>
          {(top.second || top.third) && (
            <p className="mt-1 text-sm">
              {top.second && <>🥈 {entryName(t, top.second)}</>}
              {top.third && <span className="ml-3">🥉 {entryName(t, top.third)}</span>}
            </p>
          )}
        </div>
      )}

      {organiser && <EmailReportButton kind="tournament" id={t.id} label="Email me the tournament report" />}

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error} <span className="float-right">✕</span>
        </button>
      )}

      <PhaseBar
        t={t}
        data={data}
        organiser={organiser}
        run={run}
        edit={edit}
        user={user ?? ""}
        onAdvanced={(stage) => setTab(stage === "knockout" ? "bracket" : "groups")}
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 text-sm">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setTab(x.key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 ${active === x.key ? "opt-on font-semibold" : "text-muted"}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {active === "entries" && <EntriesTab t={t} organiser={organiser} edit={edit} user={user ?? ""} />}
      {active === "groups" && <GroupsTab t={t} data={data} organiser={organiser} edit={edit} user={user ?? ""} />}
      {active === "fixtures" && (
        <FixturesTab t={t} data={data} organiser={organiser} user={user ?? ""} onEdit={setEditing} setError={setError} />
      )}
      {active === "rounds" && <RoundsTab t={t} data={data} organiser={organiser} user={user ?? ""} onEdit={setEditing} />}
      {editing && <EditFixtureSheet t={t} data={data} fixture={editing} user={user ?? ""} onClose={() => setEditing(null)} />}
      {active === "schedule" && <ScheduleTab t={t} data={data} organiser={organiser} user={user ?? ""} />}
      {active === "bracket" && (
        <>
          {t.fixtures.some((f) => f.stage === "knockout" && isMain(f)) ? (
            <Bracket t={t} data={data} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">The bracket appears when the group stage is finished.</p>
          )}
        </>
      )}
    </div>
  );
}

/** What happens next: generate fixtures, start the knockout, or a progress summary. */
function PhaseBar({
  t,
  data,
  organiser,
  run,
  edit,
  user,
  onAdvanced,
}: {
  t: Tournament;
  data: Data;
  organiser: boolean;
  run: (action: Parameters<typeof runTournamentAction>[1]) => string | null;
  edit: (mutate: (x: Tournament) => Tournament) => void;
  user: string;
  /** Called after fixtures are generated or the knockout starts, to show the new stage. */
  onAdvanced: (stage: "groups" | "knockout") => void;
}) {
  const groupFixtures = t.fixtures.filter((f) => f.stage === "group" && isMain(f));
  const done = groupFixtures.filter((f) => fixtureOutcome(f, data).winner).length;
  const thirdToggle = organiser && t.structure !== "league" && t.phase !== "complete" && (
    <label className="mt-3 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={t.thirdPlace} onChange={(e) => edit((x) => setThirdPlace(x, user, e.target.checked))} />
      Third-place match between the semi-final losers
    </label>
  );

  if (t.phase === "setup") {
    if (!organiser) return <Notice>The organiser is still setting up this tournament.</Notice>;
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="font-semibold">Set up</p>
        <ol className="mt-1 list-inside list-decimal text-sm text-muted">
          <li>Add the entries{t.structure !== "league" ? " and give seeds if you want" : ""}</li>
          {t.structure === "groups_knockout" && <li>Create groups and put every entry in one</li>}
          <li>Generate fixtures (entries and groups are then locked)</li>
        </ol>
        <button
          type="button"
          onClick={() => {
            const err = run((x, all) => {
              const r = generateFixtures(x, user, all);
              return { item: r.tournament, matches: r.created, ties: r.ties };
            });
            if (!err) onAdvanced(t.structure === "knockout" ? "knockout" : "groups");
          }}
          className="btn-grad mt-3 w-full rounded-xl py-3 font-bold"
        >
          Generate fixtures
        </button>
        {thirdToggle}
      </div>
    );
  }
  if (t.phase === "groups" && groupFixtures.length > 0) {
    const ready = t.structure === "groups_knockout" && groupStageComplete(t, data);
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="font-semibold">
          {t.structure === "league" ? "League" : "Group stage"}: {done} of {groupFixtures.length} matches finished
        </p>
        {t.structure === "groups_knockout" &&
          (organiser ? (
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                const err = run((x, all) => {
                  const r = startKnockout(x, user, all);
                  return { item: r.tournament, matches: r.created, ties: r.ties };
                });
                if (!err) onAdvanced("knockout");
              }}
              className="btn-grad mt-3 w-full rounded-xl py-3 font-bold disabled:opacity-40"
            >
              Start knockout with top {t.qualifiersPerGroup} of each group
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted">The knockout starts when every group match is finished.</p>
          ))}
        {t.structure === "groups_knockout" && !ready && organiser && (
          <p className="mt-1 text-xs text-muted">Available once every group match is closed.</p>
        )}
        {thirdToggle}
      </div>
    );
  }
  if (t.phase === "knockout" && organiser && t.structure !== "league") {
    return <div className="rounded-2xl border border-border bg-surface px-4 pb-3">{thirdToggle}</div>;
  }
  return null;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">{children}</p>;
}

function EntriesTab({
  t,
  organiser,
  edit,
  user,
}: {
  t: Tournament;
  organiser: boolean;
  edit: (mutate: (x: Tournament) => Tournament) => string | null;
  user: string;
}) {
  const setup = t.phase === "setup";
  const canEdit = organiser && setup;
  const groupOf = (id: string) => t.groups.find((g) => g.entryIds.includes(id))?.name;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex gap-2 overflow-x-auto text-xs">
          {STRUCTURES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => edit((x) => setStructure(x, user, s.key))}
              className={`whitespace-nowrap rounded-full border px-3 py-1 ${t.structure === s.key ? "opt-on font-semibold" : "border-border text-muted"}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      {canEdit && t.structure !== "knockout" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={(t.legs ?? 1) === 2} onChange={(e) => edit((x) => setLegs(x, user, e.target.checked ? 2 : 1))} />
          Play each opponent twice (home and away)
        </label>
      )}
      {canEdit && t.structure !== "league" && t.entries.length >= 4 && (
        <Notice>
          Official draws (BWF) seed {suggestedSeeds(t.entries.length)} of {t.entries.length} entries: give your strongest{" "}
          {suggestedSeeds(t.entries.length)} seeds 1–{suggestedSeeds(t.entries.length)} so they can&rsquo;t meet early.
        </Notice>
      )}

      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {t.entries.length === 0 && <li className="p-4 text-sm text-muted">No entries yet.</li>}
        {t.entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {e.name}
                {e.players.some((p) => p.cardId) && (
                  <span className="ml-1.5 inline-flex gap-1 text-xs">
                    {e.players
                      .filter((p) => p.cardId)
                      .map((p) => (
                        <Link key={p.cardId} href={`/players/${p.cardId}`} title={`${p.name}'s card`} className="text-accent">
                          🪪
                        </Link>
                      ))}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {[
                  t.format !== "singles" && e.players.map((p) => (p.jersey ? `#${p.jersey} ${p.name}` : p.name)).join(", "),
                  groupOf(e.id),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {canEdit ? (
              <>
                <label className="flex items-center gap-1 text-xs text-muted">
                  Seed
                  <input
                    className="!w-14 !px-2 text-center"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={t.entries.length}
                    value={e.seed ?? ""}
                    onChange={(ev) => edit((x) => setSeed(x, user, e.id, ev.target.value === "" ? null : Number(ev.target.value)))}
                    aria-label={`Seed for ${e.name}`}
                  />
                </label>
                <button type="button" aria-label={`Remove ${e.name}`} onClick={() => edit((x) => removeEntry(x, user, e.id))} className="px-1 text-danger">
                  ✕
                </button>
              </>
            ) : (
              e.seed && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold">Seed {e.seed}</span>
            )}
          </li>
        ))}
      </ul>

      {canEdit && <AddEntryForm t={t} edit={edit} user={user} />}
      {canEdit && <BulkEntries t={t} edit={edit} user={user} />}

      {organiser && (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Tournament scorers</h2>
          <p className="mt-0.5 text-xs text-muted">Get scoring access to every match of this tournament (including matches already created).</p>
          {t.scorers.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {t.scorers.map((s) => (
                <li key={s} className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                  {s}
                  <button type="button" aria-label={`Remove ${s}`} onClick={() => edit((x) => removeTournamentScorer(x, user, s))} className="px-2 text-muted">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <IdentityForm
              submitLabel="Add"
              onSubmit={(key) =>
                runTournamentAction(t.id, (x, all) => {
                  const r = addTournamentScorer(x, all, user, key);
                  return { item: r.tournament, matches: r.matches, ties: r.ties };
                })
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}

/** Paste a list of entries (one per line), e.g. from a spreadsheet or a WhatsApp message. */
function BulkEntries({ t, edit, user }: { t: Tournament; edit: (mutate: (x: Tournament) => Tournament) => string | null | void; user: string }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const example =
    t.format === "singles"
      ? "Riya Sharma 98765 43210 | 1\nAsha Verma 91234 56789 | 2\nMeera Iyer meera@mail.com"
      : t.format === "doubles"
        ? "Meera 98765 43210 / Karan 91234 56789 | 1\nSmashers: Sana 99887 76655 / Rahul 90000 11111"
        : "Eagles: #7 Kiran 98765 43210, #10 Arjun 91234 56789 | 1\nHawks: Dev 99887 76655, Nikhil 90000 11111";

  async function addAll() {
    const parsed = parseBulkEntries(t.format, text);
    setErrors(parsed.errors);
    if (parsed.errors.length || parsed.entries.length === 0) return;
    setBusy(true);
    const r = await resolveListed(
      parsed.entries.map((e) => e.players),
      user,
      t.sport,
    );
    setBusy(false);
    if ("errors" in r) return setErrors(r.errors);
    const err = edit((x) => addEntries(x, user, parsed.entries.map((e, i) => ({ ...e, players: r.lists[i] }))));
    if (err) setErrors([err]);
    else setText("");
  }

  return (
    <details className="rounded-2xl border border-dashed border-border p-4">
      <summary className="cursor-pointer font-semibold">Paste a list</summary>
      <p className="mt-1 text-xs text-muted">
        One {t.format === "singles" ? "player" : t.format === "doubles" ? "pair" : "team"} per line, each player&rsquo;s mobile number after their
        name; add &ldquo;| 1&rdquo; at the end for a seed. Rows copied from a spreadsheet work too.
      </p>
      <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={example} aria-label="Entries list" className="mt-2 font-mono text-sm" />
      {errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button type="button" disabled={busy} onClick={() => void addAll()} className="mt-2 w-full rounded-xl border border-border py-2.5 font-semibold disabled:opacity-60">
        {busy ? "Saving players…" : "Add all"}
      </button>
    </details>
  );
}

function AddEntryForm({ t, edit, user }: { t: Tournament; edit: (mutate: (x: Tournament) => Tournament) => string | null; user: string }) {
  const size = t.format === "singles" ? 1 : t.format === "doubles" ? 2 : 6;
  const empty = () => Array.from({ length: size }, emptyPlayer);
  const [name, setName] = useState("");
  const [players, setPlayers] = useState<PlayerDraft[]>(empty);
  const [teamId, setTeamId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = t.format === "singles" ? "player" : t.format === "doubles" ? "pair" : "team";

  async function add() {
    setBusy(true);
    const r = await resolvePlayers(
      players.map((draft, i) => ({ draft, label: t.format === "singles" ? "the player" : `player ${i + 1}` })),
      user,
      t.sport,
    );
    setBusy(false);
    if ("error" in r) return setError(r.error);
    if (t.format === "singles" && r.players.length === 0) return setError("Enter the player's name and mobile number.");
    const entryName = t.format === "singles" ? r.players[0].name : name;
    const err = edit((x) => addEntry(x, user, entryName, r.players, teamId));
    setError(err);
    if (err) return;
    setName("");
    setPlayers(empty());
    setTeamId(undefined);
  }

  return (
    <form
      className="space-y-2 rounded-2xl border border-dashed border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <h2 className="font-semibold">Add a {label}</h2>
      {t.format === "team" && (
        <TeamPicker
          sport={t.sport}
          onPick={(team) => {
            setTeamId(team.id);
            setName(team.name);
            if (team.players.length) setPlayers(team.players.map(cardPlayer));
          }}
        />
      )}
      {t.format !== "singles" && (
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setTeamId(undefined);
          }}
          placeholder={t.format === "doubles" ? "Pair name (optional)" : "Team name"}
          aria-label={`${label} name`}
        />
      )}
      {players.map((p, i) => (
        <PlayerInput
          key={i}
          value={p}
          onChange={(next) => setPlayers(players.map((x, j) => (j === i ? next : x)))}
          label={t.format === "singles" ? "Player" : `Player ${i + 1}`}
          sport={t.sport}
          jersey={t.format === "team"}
        />
      ))}
      {t.format === "team" && (
        <button type="button" onClick={() => setPlayers([...players, emptyPlayer()])} className="text-sm font-medium text-side-a">
          + Add player
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy} className="btn-grad w-full rounded-xl py-2.5 font-semibold disabled:opacity-60">
        {busy ? "Saving players…" : `Add ${label}`}
      </button>
    </form>
  );
}

function GroupsTab({
  t,
  data,
  organiser,
  edit,
  user,
}: {
  t: Tournament;
  data: Data;
  organiser: boolean;
  edit: (mutate: (x: Tournament) => Tournament) => void;
  user: string;
}) {
  const setup = t.phase === "setup";
  const tableSettings = organiser && <TableSettings t={t} edit={edit} user={user} />;

  if (t.structure === "league") {
    if (setup)
      return (
        <div className="space-y-4">
          <Notice>Everyone plays everyone{(t.legs ?? 1) === 2 ? " twice" : " once"}. The table appears when fixtures are generated.</Notice>
          {tableSettings}
        </div>
      );
    return (
      <div className="space-y-4">
        <PointsTable t={t} group={t.groups[0]} data={data} qualify={0} />
        {tableSettings}
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        {t.groups.map((g) => (
          <PointsTable key={g.id} t={t} group={g} data={data} qualify={t.qualifiersPerGroup} />
        ))}
        {t.phase === "groups" && tableSettings}
      </div>
    );
  }

  const assigned = new Set(t.groups.flatMap((g) => g.entryIds));
  const unassigned = t.entries.filter((e) => !assigned.has(e.id));
  const canEdit = organiser;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Number of groups</span>
            <select value={t.groups.length} onChange={(e) => edit((x) => setGroupCount(x, user, Number(e.target.value)))}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Qualify per group</span>
            <select value={t.qualifiersPerGroup} onChange={(e) => edit((x) => setQualifiers(x, user, Number(e.target.value)))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </label>
          {t.entries.length >= 6 && (
            <p className="col-span-2 text-xs text-muted">
              Championships use groups of 3–4: for {t.entries.length} entries that&rsquo;s about {suggestedGroups(t.entries.length)} groups.
            </p>
          )}
          <button
            type="button"
            onClick={() => edit((x) => autoAssignGroups(x, user))}
            className="col-span-2 rounded-xl border border-border py-2.5 text-sm font-semibold"
          >
            Auto-assign by seed (spreads top seeds across groups)
          </button>
        </div>
      )}
      {tableSettings}

      {t.groups.map((g) => (
        <div key={g.id} className="rounded-2xl border border-border bg-surface p-4">
          {canEdit ? (
            <input
              defaultValue={g.name}
              onBlur={(e) => e.target.value !== g.name && edit((x) => renameGroup(x, user, g.id, e.target.value))}
              aria-label="Group name"
              className="!border-0 !px-0 font-semibold"
            />
          ) : (
            <h3 className="font-semibold">{g.name}</h3>
          )}
          <ul className="mt-2 space-y-1">
            {g.entryIds.length === 0 && <li className="text-sm text-muted">Empty</li>}
            {g.entryIds.map((id) => {
              const e = t.entries.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    {e?.name} {e?.seed && <span className="text-xs text-muted">(seed {e.seed})</span>}
                  </span>
                  {canEdit && (
                    <button type="button" onClick={() => edit((x) => assignToGroup(x, user, id, null))} className="text-xs text-muted underline">
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <h3 className="font-semibold">Not in a group yet</h3>
          <ul className="mt-2 space-y-2">
            {unassigned.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {e.name} {e.seed && <span className="text-xs text-muted">(seed {e.seed})</span>}
                </span>
                {canEdit && (
                  <select
                    className="!w-auto text-sm"
                    value=""
                    onChange={(ev) => ev.target.value && edit((x) => assignToGroup(x, user, e.id, ev.target.value))}
                    aria-label={`Group for ${e.name}`}
                  >
                    <option value="">Move to…</option>
                    {t.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixturesTab({
  t,
  data,
  organiser,
  user,
  onEdit,
  setError,
}: {
  t: Tournament;
  data: Data;
  organiser: boolean;
  user: string;
  onEdit: (f: Fixture) => void;
  setError: (e: string | null) => void;
}) {
  const knockout = t.fixtures.filter((f) => f.stage === "knockout" && isMain(f));
  return (
    <div className="space-y-5">
      {t.groups.map((g) => (
        <section key={g.id} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{g.name}</h2>
          <FixtureList t={t} data={data} fixtures={t.fixtures.filter((f) => f.groupId === g.id)} organiser={organiser} onEdit={onEdit} />
          {organiser && <AddMatch t={t} user={user} where={{ groupId: g.id }} label={`Add a match to ${g.name}`} setError={setError} />}
        </section>
      ))}
      {knockout.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Knockout</h2>
          <FixtureList
            t={t}
            data={data}
            fixtures={[...knockout].sort((a, b) => a.round - b.round || Number(!!a.third) - Number(!!b.third) || a.index - b.index)}
            organiser={organiser}
            onEdit={onEdit}
          />
        </section>
      )}
      {(t.stages ?? []).map((stage) => (
        <section key={stage.id} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{stage.name}</h2>
          <FixtureList t={t} data={data} fixtures={t.fixtures.filter((f) => f.stageId === stage.id)} organiser={organiser} onEdit={onEdit} />
        </section>
      ))}
    </div>
  );
}

/** How tables are ordered: the sport's official ranking or custom points. Tables recalculate immediately. */
function TableSettings({ t, edit, user }: { t: Tournament; edit: (mutate: (x: Tournament) => Tournament) => void; user: string }) {
  const current = t.ranking ?? "custom";
  const [win, setWin] = useState(String(t.points.win));
  const [loss, setLoss] = useState(String(t.points.loss));
  const choose = (key: RankingKey) => edit((x) => setRanking(x, user, key));
  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">How the table is ranked</h2>
      {rankingChoices(t.sport).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => choose(key)}
          className={`block w-full rounded-xl border p-3 text-left ${current === key ? "opt-on" : "border-border"}`}
        >
          <span className="font-semibold">{RANKINGS[key].label}</span>
          <span className="mt-0.5 block text-xs text-muted">{RANKINGS[key].points}</span>
        </button>
      ))}
      {current === "custom" && (
        <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Win</span>
            <input type="number" inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Loss</span>
            <input type="number" inputMode="numeric" value={loss} onChange={(e) => setLoss(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() => edit((x) => setRanking(x, user, "custom", { win: Number(win), loss: Number(loss) }))}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
          >
            Save
          </button>
        </div>
      )}
    </section>
  );
}
