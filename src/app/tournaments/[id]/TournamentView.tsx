"use client";

import Link from "next/link";
import { use, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { Bracket, FixtureCard, PointsTable, entryName } from "@/components/tournament/parts";
import { FORMAT_LABELS, SPORTS } from "@/lib/rally/sports";
import { describeRules } from "@/lib/rally/rules";
import { fixtureOutcome, groupStageComplete, podium, type Data } from "@/lib/tournament/engine";
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
  setQualifiers,
  setSeed,
  setStructure,
  setThirdPlace,
  startKnockout,
} from "@/lib/tournament/mutations";
import type { Tournament } from "@/lib/tournament/types";
import { runTournamentAction, updateTournament, useMatches, useTies, useTournament, useUser } from "@/lib/store";
import { STRUCTURES } from "../new/TournamentForm";

type Tab = "entries" | "groups" | "fixtures" | "bracket";

export function TournamentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTournament(id);
  const matches = useMatches();
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
  const organiser = user === t.organiser;
  const setup = t.phase === "setup";
  const tabs: { key: Tab; label: string }[] = [
    { key: "entries", label: `Entries (${t.entries.length})` },
    ...(t.structure !== "knockout" ? [{ key: "groups" as const, label: t.structure === "league" ? "Table" : "Groups" }] : []),
    ...(!setup ? [{ key: "fixtures" as const, label: "Fixtures" }] : []),
    ...(t.structure !== "league" && !setup ? [{ key: "bracket" as const, label: "Bracket" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(setup ? "entries" : t.structure === "knockout" ? "bracket" : "groups");
  const active = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;
  const [error, setError] = useState<string | null>(null);
  const run = (action: Parameters<typeof runTournamentAction>[1]) => {
    const err = runTournamentAction(t.id, action);
    setError(err);
    return err;
  };
  const edit = (mutate: (x: Tournament) => Tournament) => setError(updateTournament(t.id, mutate));

  const top = podium(t, data);
  const sport = SPORTS[t.sport];

  return (
    <div className="space-y-4 pb-10">
      <div>
        <p className="text-sm text-muted">
          {[sport.name, FORMAT_LABELS[t.format], STRUCTURES.find((s) => s.key === t.structure)?.title, t.venue, t.startDate]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <h1 className="text-xl font-bold">{t.name}</h1>
        <p className="mt-0.5 text-xs text-muted">
          Organiser {t.organiser} · {describeRules(t.rules, sport.setLabel)}
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
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 ${active === x.key ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {active === "entries" && <EntriesTab t={t} organiser={organiser} edit={edit} user={user ?? ""} />}
      {active === "groups" && <GroupsTab t={t} data={data} organiser={organiser} edit={edit} user={user ?? ""} />}
      {active === "fixtures" && <FixturesTab t={t} data={data} />}
      {active === "bracket" && (
        <>
          {t.fixtures.some((f) => f.stage === "knockout") ? (
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
  const groupFixtures = t.fixtures.filter((f) => f.stage === "group");
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
          className="mt-3 w-full rounded-xl bg-foreground py-3 font-bold text-background"
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
              className="mt-3 w-full rounded-xl bg-foreground py-3 font-bold text-background disabled:opacity-40"
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
  edit: (mutate: (x: Tournament) => Tournament) => void;
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
              className={`whitespace-nowrap rounded-full border px-3 py-1 ${t.structure === s.key ? "border-foreground font-semibold" : "border-border text-muted"}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}

      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {t.entries.length === 0 && <li className="p-4 text-sm text-muted">No entries yet.</li>}
        {t.entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{e.name}</p>
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

function AddEntryForm({ t, edit, user }: { t: Tournament; edit: (mutate: (x: Tournament) => Tournament) => void; user: string }) {
  const size = t.format === "singles" ? 1 : t.format === "doubles" ? 2 : 6;
  const empty = () => Array.from({ length: size }, () => ({ name: "", jersey: "" }));
  const [name, setName] = useState("");
  const [players, setPlayers] = useState(empty);
  const label = t.format === "singles" ? "player" : t.format === "doubles" ? "pair" : "team";

  function add() {
    const entryName = t.format === "singles" ? players[0].name : name;
    edit((x) => addEntry(x, user, entryName, players));
    setName("");
    setPlayers(empty());
  }

  return (
    <form
      className="space-y-2 rounded-2xl border border-dashed border-border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <h2 className="font-semibold">Add a {label}</h2>
      {t.format !== "singles" && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.format === "doubles" ? "Pair name (optional)" : "Team name"}
          aria-label={`${label} name`}
        />
      )}
      {players.map((p, i) => (
        <div key={i} className="flex gap-2">
          {t.format === "team" && (
            <input
              className="!w-16 shrink-0"
              value={p.jersey}
              onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, jersey: e.target.value } : x)))}
              placeholder="#"
              aria-label="Jersey number"
            />
          )}
          <input
            value={p.name}
            onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            placeholder={t.format === "singles" ? "Player name" : `Player ${i + 1}${t.format === "team" ? " (optional)" : ""}`}
            aria-label={t.format === "singles" ? "Player name" : `Player ${i + 1}`}
          />
        </div>
      ))}
      {t.format === "team" && (
        <button type="button" onClick={() => setPlayers([...players, { name: "", jersey: "" }])} className="text-sm font-medium text-side-a">
          + Add player
        </button>
      )}
      <button type="submit" className="w-full rounded-xl bg-foreground py-2.5 font-semibold text-background">
        Add {label}
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

  if (t.structure === "league") {
    if (setup) return <Notice>Everyone plays everyone once. The table appears when fixtures are generated.</Notice>;
    return <PointsTable t={t} group={t.groups[0]} data={data} qualify={0} />;
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        {t.groups.map((g) => (
          <PointsTable key={g.id} t={t} group={g} data={data} qualify={t.qualifiersPerGroup} />
        ))}
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
          <button
            type="button"
            onClick={() => edit((x) => autoAssignGroups(x, user))}
            className="col-span-2 rounded-xl border border-border py-2.5 text-sm font-semibold"
          >
            Auto-assign by seed (spreads top seeds across groups)
          </button>
        </div>
      )}

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

function FixturesTab({ t, data }: { t: Tournament; data: Data }) {
  const sections: { title: string; fixtures: typeof t.fixtures }[] = [];
  for (const g of t.groups) {
    const list = t.fixtures.filter((f) => f.groupId === g.id).sort((a, b) => a.round - b.round || a.index - b.index);
    if (list.length) sections.push({ title: g.name, fixtures: list });
  }
  const knockout = t.fixtures
    .filter((f) => f.stage === "knockout")
    .sort((a, b) => a.round - b.round || Number(!!a.third) - Number(!!b.third) || a.index - b.index);
  if (knockout.length) sections.push({ title: "Knockout", fixtures: knockout });

  return (
    <div className="space-y-5">
      {sections.map((s) => (
        <section key={s.title}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
          <div className="space-y-2">
            {s.fixtures.map((f) => (
              <FixtureCard key={f.id} t={t} fixture={f} data={data} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
