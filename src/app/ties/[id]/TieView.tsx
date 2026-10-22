"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { sideBg, sideText } from "@/components/match-ui";
import { Sheet } from "@/components/Sheet";
import { matchState } from "@/lib/rally/engine";
import { describeRules } from "@/lib/rally/rules";
import { SPORTS } from "@/lib/rally/sports";
import type { SideKey } from "@/lib/rally/types";
import { tieSystem } from "@/lib/tie/systems";
import { addTieScorer, createSlotMatch, hasTieAccess, playerLabel, setLetters, setLineup, setPlayAll, tieState, type SlotView } from "@/lib/tie/tie";
import type { Tie } from "@/lib/tie/types";
import { runTieAction, useMatches, useTie, useUser } from "@/lib/store";

export function TieView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tie = useTie(id);
  const matches = useMatches();
  if (tie === undefined || matches === null) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (tie === null)
    return (
      <div className="py-10 text-center">
        <p className="text-muted">This tie does not exist on this device.</p>
        <Link href="/" className="mt-3 inline-block font-medium text-side-a underline">
          Back home
        </Link>
      </div>
    );
  return <View tie={tie} matches={matches} />;
}

const STATUS: Record<SlotView["status"], string> = {
  needs_lineup: "Line-up not set",
  ready: "Ready",
  scheduled: "Upcoming",
  live: "Live",
  won: "Final",
  no_result: "No result",
  not_needed: "Not needed",
};

function View({ tie, matches }: { tie: Tie; matches: ReturnType<typeof useMatches> & object }) {
  const router = useRouter();
  const user = useUser();
  const access = hasTieAccess(tie, user);
  const organiser = user === tie.organiser;
  const state = tieState(tie, matches);
  const [lineupFor, setLineupFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Creates the match for a slot (after an optional line-up) and opens its scorer screen. */
  function start(index: number) {
    let matchId: string | undefined;
    const err = runTieAction(tie.id, (t, data) => {
      const r = createSlotMatch(t, user!, index, data.matches);
      matchId = r.match.id;
      return { item: r.tie, matches: [r.match] };
    });
    setError(err);
    if (!err && matchId) router.push(`/matches/${matchId}/score`);
  }

  return (
    <div className="space-y-4 pb-10">
      <div>
        {tie.tournament && (
          <Link href={`/tournaments/${tie.tournament.id}`} className="text-sm font-medium text-side-a">
            ← Tournament · {tie.tournament.label}
          </Link>
        )}
        <p className="text-sm text-muted">
          {[SPORTS[tie.sport].name, "Team tie", tie.venue].filter(Boolean).join(" · ")}
        </p>
        <h1 className="text-xl font-bold">{tie.title}</h1>
        <p className="mt-0.5 text-xs text-muted">
          {tieSystem(tie.system) ? `${tieSystem(tie.system)!.label} · ` : ""}
          {describeRules(tie.rules, SPORTS[tie.sport].setLabel)} · first to {state.needed} of {tie.matchCount} matches
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        {(["A", "B"] as const).map((side) => (
          <div key={side} className="flex items-center gap-3 py-1.5">
            <span className={`h-8 w-1.5 rounded-full ${sideBg[side]}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">
                {tie.teams[side].name} {state.winner === side && <span className="text-accent">✓</span>}
              </p>
              <p className="truncate text-xs text-muted">{tie.teams[side].players.map((p) => p.name).join(", ")}</p>
            </div>
            <span className={`tabular text-4xl font-bold ${sideText[side]}`}>{state.score[side]}</span>
          </div>
        ))}
        <p className="mt-2 text-center text-sm">
          {state.winner ? (
            <span className="font-semibold text-accent">
              {tie.teams[state.winner].name} win the tie {state.score[state.winner]}–{state.score[state.winner === "A" ? "B" : "A"]}
            </span>
          ) : state.live ? (
            <span className="font-semibold text-live">● Live</span>
          ) : (
            <span className="text-muted">Matches won</span>
          )}
        </p>
      </div>

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error}
        </button>
      )}

      {organiser && state.winner && (
        <label className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={tie.playAll}
            onChange={(e) => setError(runTieAction(tie.id, (t) => ({ item: setPlayAll(t, user!, e.target.checked) })))}
          />
          Play the remaining matches anyway
        </label>
      )}

      {tieSystem(tie.system)?.letters && <LettersPanel tie={tie} access={access} user={user} setError={setError} />}

      <ol className="space-y-2">
        {state.slots.map((view) => (
          <SlotCard key={view.slot.index} tie={tie} view={view} access={access} onLineup={() => setLineupFor(view.slot.index)} onStart={() => start(view.slot.index)} />
        ))}
      </ol>

      {access ? (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Scoring access</h2>
          <p className="mt-0.5 text-xs text-muted">Organiser {tie.organiser}{tie.scorers.length ? ` · ${tie.scorers.join(", ")}` : ""}</p>
          <p className="mt-2 text-sm font-medium">Give someone access to every match of this tie</p>
          <div className="mt-1.5">
            <IdentityForm
              submitLabel="Add"
              onSubmit={(key) =>
                runTieAction(tie.id, (t, data) => {
                  const r = addTieScorer(t, user!, key, data.matches);
                  return { item: r.tie, matches: r.matches };
                })
              }
            />
          </div>
        </section>
      ) : (
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
          {user ? "You can follow this tie live. Ask the organiser for scoring access to score it." : "Sign in to score this tie."}
        </p>
      )}

      {lineupFor !== null && (
        <LineupSheet
          tie={tie}
          index={lineupFor}
          onClose={() => setLineupFor(null)}
          onSave={(format, players, andStart) => {
            const err = runTieAction(tie.id, (t, data) => ({ item: setLineup(t, user!, lineupFor, format, players, data.matches) }));
            if (err) return err;
            setLineupFor(null);
            if (andStart) start(lineupFor);
            return null;
          }}
        />
      )}
    </div>
  );
}

function SlotCard({
  tie,
  view,
  access,
  onLineup,
  onStart,
}: {
  tie: Tie;
  view: SlotView;
  access: boolean;
  onLineup: () => void;
  onStart: () => void;
}) {
  const { slot, match, status } = view;
  const state = match ? matchState(match) : null;
  const names = (side: SideKey) => (slot.players ? playerLabel(tie.teams[side], slot.players[side]) : "—");
  const muted = status === "not_needed";

  const content = (
    <div className={`rounded-xl border border-border bg-surface p-3 ${muted ? "opacity-50" : ""}`}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>
          Match {slot.index + 1}
          {slot.label ? ` · ${slot.label}` : slot.format ? ` · ${slot.format === "singles" ? "Singles" : "Doubles"}` : ""}
        </span>
        <span className={status === "live" ? "font-semibold text-live" : ""}>{STATUS[status]}</span>
      </div>
      {(["A", "B"] as const).map((side) => (
        <div key={side} className={`flex items-center gap-2 ${view.winner === side ? "font-bold" : ""}`}>
          <span className={`h-4 w-1 rounded-full ${sideBg[side]}`} />
          <span className="min-w-0 flex-1 truncate">{names(side)}</span>
          {state && status !== "scheduled" && (
            <span className="tabular text-sm">
              {state.sets
                .filter((s) => s.winner || status === "live")
                .map((s) => s[side])
                .join("  ")}
            </span>
          )}
        </div>
      ))}
      {access && !match && !muted && slot.letters && !slot.players && (
        <p className="mt-2 text-xs text-muted">Players are filled in once both captains give their letters above.</p>
      )}
      {access && !match && !muted && (!slot.letters || slot.players) && (
        <div className="mt-2 flex gap-2">
          {slot.players ? (
            <>
              <button type="button" onClick={onStart} className="flex-1 rounded-lg bg-foreground py-2 text-sm font-semibold text-background">
                Start match
              </button>
              {!slot.letters && (
                <button type="button" onClick={onLineup} className="rounded-lg border border-border px-3 text-sm">
                  Change line-up
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={onLineup} className="flex-1 rounded-lg bg-foreground py-2 text-sm font-semibold text-background">
              Pick line-up & start
            </button>
          )}
        </div>
      )}
    </div>
  );
  return <li>{match ? <Link href={access && match.status !== "closed" ? `/matches/${match.id}/score` : `/matches/${match.id}`}>{content}</Link> : content}</li>;
}

/** Singles or doubles, then the starting players from each team's list. */
function LineupSheet({
  tie,
  index,
  onClose,
  onSave,
}: {
  tie: Tie;
  index: number;
  onClose: () => void;
  onSave: (format: "singles" | "doubles", players: Record<SideKey, string[]>, andStart: boolean) => string | null;
}) {
  const slot = tie.slots[index];
  const [format, setFormat] = useState<"singles" | "doubles">(slot.format ?? "singles");
  const [picks, setPicks] = useState<Record<SideKey, string[]>>(slot.players ?? { A: [], B: [] });
  const [error, setError] = useState<string | null>(null);
  const size = format === "singles" ? 1 : 2;
  const fixedFormat = !!tie.system && !!slot.format;

  function toggle(side: SideKey, id: string) {
    setPicks((prev) => {
      const chosen = prev[side];
      if (chosen.includes(id)) return { ...prev, [side]: chosen.filter((x) => x !== id) };
      return { ...prev, [side]: [...chosen, id].slice(-size) };
    });
  }

  const complete = picks.A.length === size && picks.B.length === size;
  const save = (andStart: boolean) => setError(onSave(format, picks, andStart));

  return (
    <Sheet title={`Match ${index + 1}: ${slot.label ?? "line-up"}`} onClose={onClose}>
      {fixedFormat ? (
        <p className="text-sm text-muted">{format === "singles" ? "Singles" : "Doubles"} in this format.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(["singles", "doubles"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFormat(f);
                setPicks((prev) => ({ A: prev.A.slice(0, f === "singles" ? 1 : 2), B: prev.B.slice(0, f === "singles" ? 1 : 2) }));
              }}
              className={`rounded-lg border py-2 text-sm ${format === f ? "border-foreground font-semibold" : "border-border text-muted"}`}
            >
              {f === "singles" ? "Singles" : "Doubles"}
            </button>
          ))}
        </div>
      )}
      {(["A", "B"] as const).map((side) => (
        <div key={side} className="mt-4">
          <p className={`mb-1.5 text-sm font-semibold ${sideText[side]}`}>
            {tie.teams[side].name}: pick {size === 1 ? "1 player" : "2 players"}
          </p>
          <div className="flex flex-wrap gap-2">
            {tie.teams[side].players.map((p) => {
              const on = picks[side].includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(side, p.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${on ? `border-transparent font-semibold text-white ${sideBg[side]}` : "border-border"}`}
                >
                  {p.jersey ? `#${p.jersey} ` : ""}
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" disabled={!complete} onClick={() => save(false)} className="rounded-xl border border-border py-3 font-medium disabled:opacity-40">
          Save line-up
        </button>
        <button type="button" disabled={!complete} onClick={() => save(true)} className="rounded-xl bg-foreground py-3 font-bold text-background disabled:opacity-40">
          Save & start
        </button>
      </div>
    </Sheet>
  );
}

/** ITTF systems: each captain gives letters (A, B, C / X, Y, Z) to players; the singles follow from them. */
function LettersPanel({
  tie,
  access,
  user,
  setError,
}: {
  tie: Tie;
  access: boolean;
  user: string | null;
  setError: (e: string | null) => void;
}) {
  const system = tieSystem(tie.system)!;
  const [editing, setEditing] = useState<SideKey | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const name = (side: SideKey, id?: string) => tie.teams[side].players.find((p) => p.id === id)?.name;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Team letters</h2>
      <p className="mt-0.5 text-xs text-muted">Decided by lot: {tie.teams.A.name} use {system.letters!.A.join(", ")}, {tie.teams.B.name} use {system.letters!.B.join(", ")}.</p>
      {(["A", "B"] as const).map((side) => {
        const current = tie.letters?.[side] ?? {};
        const given = system.letters![side].every((l) => current[l]);
        return (
          <div key={side} className="mt-3">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${sideText[side]}`}>{tie.teams[side].name}</p>
              {access && editing !== side && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...current });
                    setEditing(side);
                  }}
                  className="rounded-lg border border-border px-3 py-1 text-sm"
                >
                  {given ? "Change" : "Give letters"}
                </button>
              )}
            </div>
            {editing === side ? (
              <div className="mt-2 space-y-2">
                {system.letters![side].map((letter) => (
                  <label key={letter} className="flex items-center gap-2">
                    <span className="w-6 font-bold">{letter}</span>
                    <select value={draft[letter] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [letter]: e.target.value }))} aria-label={`${tie.teams[side].name} player ${letter}`}>
                      <option value="">Choose a player…</option>
                      {tie.teams[side].players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-border py-2 text-sm">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const err = runTieAction(tie.id, (t) => ({ item: setLetters(t, user!, side, draft) }));
                      setError(err);
                      if (!err) setEditing(null);
                    }}
                    className="rounded-lg bg-foreground py-2 text-sm font-semibold text-background"
                  >
                    Save letters
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {given ? system.letters![side].map((l) => `${l}: ${name(side, current[l])}`).join(" · ") : "Not given yet"}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
