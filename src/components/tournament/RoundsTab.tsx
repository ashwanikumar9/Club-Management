"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { isByeFixture, isMain, resolveSides, seedOrder, type Data } from "@/lib/tournament/engine";
import { fixtureLabel } from "@/lib/tournament/mutations";
import {
  addFixture,
  addStage,
  deleteFixture,
  removeStage,
  setFixtureSides,
  swapFixtureSides,
  type RoundsResult,
} from "@/lib/tournament/rounds";
import type { Fixture, Stage, Tournament } from "@/lib/tournament/types";
import { runTournamentAction } from "@/lib/store";
import { Bracket, FixtureCard, PointsTable } from "./parts";

const KINDS: { key: Stage["kind"]; title: string; text: string }[] = [
  { key: "league", title: "Round-robin", text: "Everyone in the round plays everyone (in one or more groups), with its own table." },
  { key: "knockout", title: "Knockout", text: "A seeded bracket, e.g. a Plate for teams that didn't qualify." },
  { key: "matches", title: "Single matches", text: "Add one-off matches by hand, e.g. an exhibition or a play-off." },
];

/** Runs a rounds action through the store, returning an error message. */
export function runRounds(t: Tournament, action: (x: Tournament, data: Data) => RoundsResult): string | null {
  return runTournamentAction(t.id, (x, data) => {
    const r = action(x, data);
    return { item: r.tournament, matches: r.matches, ties: r.ties, deleteMatches: r.deleteMatches, deleteTies: r.deleteTies };
  });
}

/** Extra rounds on top of the main structure, with their tables, brackets and matches. */
export function RoundsTab({ t, data, organiser, user, onEdit }: { t: Tournament; data: Data; organiser: boolean; user: string; onEdit: (f: Fixture) => void }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stages = t.stages ?? [];

  return (
    <div className="space-y-5">
      {stages.length === 0 && (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Add rounds beyond the main event: a second group stage (Super 4), a Plate for teams that didn&rsquo;t qualify, or one-off matches.
        </p>
      )}
      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error}
        </button>
      )}
      {stages.map((stage) => (
        <section key={stage.id} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{stage.name}</h2>
              <p className="text-xs text-muted">{KINDS.find((k) => k.key === stage.kind)?.title}</p>
            </div>
            {organiser && (
              <button
                type="button"
                onClick={() => setError(runRounds(t, (x, d) => removeStage(x, user, d, stage.id)))}
                className="text-sm text-danger underline"
              >
                Remove round
              </button>
            )}
          </div>
          {stage.kind === "league" &&
            stage.groups.map((g) => <PointsTable key={g.id} t={t} group={g} data={data} qualify={0} />)}
          {stage.kind === "knockout" && <Bracket t={t} data={data} stageId={stage.id} />}
          {stage.kind !== "knockout" && (
            <FixtureList t={t} data={data} fixtures={t.fixtures.filter((f) => f.stageId === stage.id)} organiser={organiser} onEdit={onEdit} />
          )}
          {organiser && stage.kind === "matches" && <AddMatch t={t} user={user} where={{ stageId: stage.id }} setError={setError} />}
          {organiser && stage.kind === "league" &&
            stage.groups.map((g) => (
              <AddMatch key={g.id} t={t} user={user} where={{ groupId: g.id }} label={`Add a match to ${g.name}`} setError={setError} />
            ))}
        </section>
      ))}
      {organiser && (
        <button type="button" onClick={() => setAdding(true)} className="w-full rounded-xl border border-dashed border-border py-3 font-semibold">
          + Add a round
        </button>
      )}
      {adding && <AddStageSheet t={t} data={data} user={user} onClose={() => setAdding(false)} />}
    </div>
  );
}

export function FixtureList({
  t,
  data,
  fixtures,
  organiser,
  onEdit,
}: {
  t: Tournament;
  data: Data;
  fixtures: Fixture[];
  organiser: boolean;
  onEdit: (f: Fixture) => void;
}) {
  if (fixtures.length === 0) return <p className="text-sm text-muted">No matches yet.</p>;
  return (
    <ul className="space-y-2">
      {[...fixtures]
        .sort((a, b) => a.round - b.round || a.index - b.index)
        .map((f) => (
          <li key={f.id} className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <FixtureCard t={t} fixture={f} data={data} />
            </div>
            {organiser && !isByeFixture(f) && (
              <button type="button" onClick={() => onEdit(f)} aria-label={`Edit ${fixtureLabel(t, f)}`} className="shrink-0 rounded-lg border border-border px-2 text-sm">
                ✎
              </button>
            )}
          </li>
        ))}
    </ul>
  );
}

/** Two entry pickers and an Add button. */
export function AddMatch({
  t,
  user,
  where,
  label = "Add a match",
  setError,
}: {
  t: Tournament;
  user: string;
  where: { groupId?: string; stageId?: string };
  label?: string;
  setError: (e: string | null) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <details className="rounded-xl border border-dashed border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          [a, setA],
          [b, setB],
        ].map(([value, set], i) => (
          <select
            key={i}
            value={value as string}
            onChange={(e) => (set as (v: string) => void)(e.target.value)}
            aria-label={i === 0 ? "First entry" : "Second entry"}
            className="text-sm"
          >
            <option value="">{i === 0 ? "Choose…" : "vs…"}</option>
            {t.entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          const err = runRounds(t, (x, d) => addFixture(x, user, d, where, a, b));
          setError(err);
          if (!err) {
            setA("");
            setB("");
          }
        }}
        className="btn-grad mt-2 w-full rounded-lg py-2 text-sm font-semibold"
      >
        Add match
      </button>
    </details>
  );
}

function AddStageSheet({ t, data, user, onClose }: { t: Tournament; data: Data; user: string; onClose: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Stage["kind"]>("knockout");
  const [groupCount, setGroupCount] = useState(1);
  const [thirdPlace, setThirdPlace] = useState(false);
  const ordered = seedOrder(t.entries);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Entries already in the main knockout: "didn't qualify" picks everyone else (a Plate).
  const inKnockout = new Set(
    t.fixtures
      .filter((f) => f.stage === "knockout" && isMain(f))
      .flatMap((f) => {
        const { a, b } = resolveSides(f, t.fixtures, data);
        return [a, b];
      })
      .filter(Boolean),
  );
  const picks: { label: string; ids: string[] }[] = [
    { label: "Everyone", ids: ordered.map((e) => e.id) },
    ...(inKnockout.size ? [{ label: "Didn't make the knockout", ids: ordered.filter((e) => !inKnockout.has(e.id)).map((e) => e.id) }] : []),
    { label: "Clear", ids: [] },
  ];

  return (
    <Sheet title="Add a round" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plate, Super 4, Exhibition" autoFocus />
        </label>
        <div className="space-y-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`block w-full rounded-xl border p-3 text-left text-sm ${kind === k.key ? "opt-on" : "border-border"}`}
            >
              <span className="font-semibold">{k.title}</span>
              <span className="block text-muted">{k.text}</span>
            </button>
          ))}
        </div>
        {kind !== "matches" && (
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Who plays</span>
              {picks.map((p) => (
                <button key={p.label} type="button" onClick={() => setChosen(p.ids)} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                  {p.label}
                </button>
              ))}
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {ordered.map((e) => (
                <li key={e.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.includes(e.id)}
                      onChange={(ev) => setChosen(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))}
                    />
                    {e.name}
                    {e.seed && <span className="text-xs text-muted">seed {e.seed}</span>}
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">{chosen.length} chosen. Seeded in tournament seed order.</p>
          </div>
        )}
        {kind === "league" && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Groups</span>
            <select value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "knockout" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
            Third-place match
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={() => {
            const entryIds = ordered.map((e) => e.id).filter((x) => chosen.includes(x));
            const err = runRounds(t, (x, d) => addStage(x, user, d, { name, kind, entryIds, groupCount, thirdPlace }));
            setError(err);
            if (!err) onClose();
          }}
          className="btn-grad w-full rounded-xl py-3 font-bold"
        >
          Add round
        </button>
      </div>
    </Sheet>
  );
}

/** Change who plays, swap sides or delete a fixture that hasn't started. */
export function EditFixtureSheet({ t, data, fixture, user, onClose }: { t: Tournament; data: Data; fixture: Fixture; user: string; onClose: () => void }) {
  const sides = resolveSides(fixture, t.fixtures, data);
  const [a, setA] = useState(sides.a ?? "");
  const [b, setB] = useState(sides.b ?? "");
  const [error, setError] = useState<string | null>(null);
  const run = (action: (x: Tournament, d: Data) => RoundsResult) => {
    const err = runRounds(t, action);
    setError(err);
    if (!err) onClose();
  };

  return (
    <Sheet title={`Edit: ${fixtureLabel(t, fixture)}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Change who plays (e.g. after a withdrawal), swap sides, or delete the match. Only before it starts.</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          [a, setA, "First side"],
          [b, setB, "Second side"],
        ].map(([value, set, label]) => (
          <label key={label as string} className="block text-sm">
            <span className="mb-1 block font-medium">{label as string}</span>
            <select value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} aria-label={label as string}>
              <option value="">Choose…</option>
              {t.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 grid gap-2">
        <button type="button" onClick={() => run((x, d) => setFixtureSides(x, user, d, fixture.id, a, b))} className="btn-grad rounded-xl py-3 font-bold">
          Save players
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => run((x, d) => swapFixtureSides(x, user, d, fixture.id))} className="rounded-xl border border-border py-2.5 font-medium">
            ⇄ Swap sides
          </button>
          <button type="button" onClick={() => run((x, d) => deleteFixture(x, user, d, fixture.id))} className="rounded-xl border border-danger py-2.5 font-medium text-danger">
            Delete match
          </button>
        </div>
      </div>
    </Sheet>
  );
}
