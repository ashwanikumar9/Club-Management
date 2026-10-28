"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RulesFields } from "@/components/RulesFields";
import { SportPicker } from "@/components/SportPicker";
import { SystemPicker } from "@/components/SystemPicker";
import { ActionBar, StepHeader } from "@/components/Wizard";
import { cardPlayer, checkPlayers, emptyPlayer, PlayerInput, resolvePlayers, type PlayerDraft } from "@/components/PlayerInput";
import { TeamPicker } from "@/components/TeamBits";
import { MutationError } from "@/lib/rally/mutations";
import { SPORTS } from "@/lib/rally/sports";
import type { RallyRules, SideKey } from "@/lib/rally/types";
import { createTie } from "@/lib/tie/tie";
import type { LineupMode, Tie } from "@/lib/tie/types";
import { saveTie, useUser } from "@/lib/store";

type Row = PlayerDraft;

interface Lineup {
  format: "singles" | "doubles";
  A: number[];
  B: number[];
}

const emptyRows = (n: number): Row[] => Array.from({ length: n }, emptyPlayer);

/** Default order for a 5-match tie: S, S, D, S, D (like most club team events). */
function defaultLineups(count: number): Lineup[] {
  const pattern: ("singles" | "doubles")[] = ["singles", "singles", "doubles", "singles", "doubles"];
  return Array.from({ length: count }, (_, i) => ({ format: pattern[i % pattern.length], A: [], B: [] }));
}

export function TieForm() {
  const router = useRouter();
  const user = useUser();
  const [sport, setSport] = useState<Tie["sport"]>("badminton");
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [teams, setTeams] = useState<Record<SideKey, { name: string; players: Row[] }>>({
    A: { name: "", players: emptyRows(4) },
    B: { name: "", players: emptyRows(4) },
  });
  const [system, setSystem] = useState("");
  const [step, setStep] = useState(1);
  const [matchCount, setMatchCount] = useState(5);
  const [mode, setMode] = useState<LineupMode>("at_start");
  const [lineups, setLineups] = useState<Lineup[]>(defaultLineups(5));
  const [rules, setRules] = useState<RallyRules>(SPORTS.badminton.rules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <div className="space-y-3 py-6 text-center">
        <h1 className="text-xl font-bold">New team tie</h1>
        <p className="text-muted">Sign in first (top right). You become the organiser of ties you create.</p>
      </div>
    );
  }

  const named = (side: SideKey) => teams[side].players.map((p, i) => ({ ...p, i })).filter((p) => p.name.trim());

  function setCount(n: number) {
    setMatchCount(n);
    setLineups((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? defaultLineups(n)[i]));
  }

  function updateTeam(side: SideKey, change: Partial<{ name: string; players: Row[] }>) {
    setTeams((prev) => ({ ...prev, [side]: { ...prev[side], ...change } }));
  }

  function choose(index: number, side: SideKey, slot: number, value: string) {
    setLineups((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const picks = [...l[side]];
        picks[slot] = value === "" ? Number.NaN : Number(value);
        return { ...l, [side]: picks.filter((x) => !Number.isNaN(x)) };
      }),
    );
  }

  const drafts = (side: SideKey) => teams[side].players.map((draft, i) => ({ draft, label: `team ${side} player ${i + 1}` }));

  /** Every player entered needs a name and mobile number (checked before leaving the teams step). */
  function checkTeams(): string | null {
    for (const side of ["A", "B"] as const) {
      const r = checkPlayers(drafts(side));
      if ("error" in r) return r.error;
    }
    return null;
  }

  async function submit() {
    if (busy) return;
    const invalid = checkTeams();
    if (invalid) return setError(invalid);
    setBusy(true);
    const resolved: Partial<Record<SideKey, { cardId: string; name: string; jersey?: string }[]>> = {};
    for (const side of ["A", "B"] as const) {
      const r = await resolvePlayers(drafts(side), user!, sport);
      if ("error" in r) {
        setBusy(false);
        return setError(r.error);
      }
      resolved[side] = r.players;
    }
    setBusy(false);
    try {
      // Line-up positions refer to rows in the form; map them to positions among the named players.
      const position = (side: SideKey, row: number) => named(side).findIndex((p) => p.i === row);
      const tie = createTie({
        sport,
        title,
        venue,
        rules,
        teams: {
          A: { name: teams.A.name, players: resolved.A! },
          B: { name: teams.B.name, players: resolved.B! },
        },
        matchCount,
        system: system || undefined,
        lineupMode: mode,
        lineups:
          mode === "advance" && !system
            ? lineups.map((l) => ({ format: l.format, A: l.A.map((r) => position("A", r)), B: l.B.map((r) => position("B", r)) }))
            : undefined,
        organiser: user!,
      });
      saveTie(
        date || time ? { ...tie, schedule: { date: date || undefined, time: time || undefined, court: venue.trim() || undefined } } : tie,
      );
      router.push(`/ties/${tie.id}`);
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 3) void submit();
        else if (step === 2) {
          const invalid = checkTeams();
          setError(invalid);
          if (!invalid) setStep(3);
        } else setStep(step + 1);
      }}
    >
      <StepHeader
        step={step}
        total={3}
        title={["Team tie: sport and format", "The two teams", "Line-ups and rules"][step - 1]}
        onBack={() => setStep(step - 1)}
      />

      {step === 1 && (
        <>
          <p className="text-sm text-muted">Two teams play several singles and doubles matches; the first team to win the majority wins.</p>
          <SportPicker
            value={sport}
            sports={["badminton", "table_tennis"]}
            onChange={(s) => {
              setSport(s as Tie["sport"]);
              setRules(SPORTS[s].rules);
              setSystem("");
            }}
          />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Format</h2>
            <SystemPicker sport={sport} value={system} onChange={setSystem} />
          </section>
        </>
      )}

      {step === 2 && (
        <section className="grid gap-4 sm:grid-cols-2">
          {(["A", "B"] as const).map((side) => (
            <div key={side} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
              <div className={`text-sm font-bold ${side === "A" ? "text-side-a" : "text-side-b"}`}>Team {side}</div>
              <TeamPicker sport={sport} onPick={(t) => updateTeam(side, { name: t.name, players: t.players.length ? t.players.map(cardPlayer) : teams[side].players })} />
              <input
                value={teams[side].name}
                onChange={(e) => updateTeam(side, { name: e.target.value })}
                placeholder="Team name"
                aria-label={`Team ${side} name`}
              />
              <span className="block pt-1 text-sm font-medium">Players</span>
              {teams[side].players.map((p, i) => (
                <PlayerInput
                  key={i}
                  value={p}
                  onChange={(next) => updateTeam(side, { players: teams[side].players.map((x, j) => (j === i ? next : x)) })}
                  label={`Team ${side} player ${i + 1}`}
                  sport={sport}
                  jersey
                />
              ))}
              <button
                type="button"
                onClick={() => updateTeam(side, { players: [...teams[side].players, emptyPlayer()] })}
                className="text-sm font-medium text-side-a"
              >
                + Add player
              </button>
            </div>
          ))}
        </section>
      )}

      {step === 3 && !system && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Number of matches</span>
            <select value={matchCount} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 3, 5, 7, 9].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "match" : `matches (first to ${Math.floor(n / 2) + 1} wins)`}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-sm font-medium">Are all the match-ups decided?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["advance", "Yes, enter them now"],
                  ["at_start", "No, pick at each match"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded-lg border py-2 text-sm ${mode === key ? "opt-on font-semibold" : "border-border text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              {mode === "at_start"
                ? "When a match starts, the scorer chooses singles or doubles and picks the starting players from each team."
                : "Choose singles or doubles and the players for every match. They can still be changed before each match starts."}
            </p>
          </div>

          {mode === "advance" &&
            lineups.map((l, index) => (
              <div key={index} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">Match {index + 1}</span>
                  <select
                    className="!w-auto text-sm"
                    value={l.format}
                    onChange={(e) =>
                      setLineups((prev) =>
                        prev.map((x, i) => (i === index ? { format: e.target.value as Lineup["format"], A: [], B: [] } : x)),
                      )
                    }
                    aria-label={`Match ${index + 1} format`}
                  >
                    <option value="singles">Singles</option>
                    <option value="doubles">Doubles</option>
                  </select>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["A", "B"] as const).map((side) => (
                    <div key={side} className="space-y-1">
                      {Array.from({ length: l.format === "singles" ? 1 : 2 }, (_, slot) => (
                        <select
                          key={slot}
                          value={l[side][slot] ?? ""}
                          onChange={(e) => choose(index, side, slot, e.target.value)}
                          aria-label={`Match ${index + 1} ${teams[side].name || `Team ${side}`} player ${slot + 1}`}
                          className="text-sm"
                        >
                          <option value="">{teams[side].name || `Team ${side}`}…</option>
                          {named(side).map((p) => (
                            <option key={p.i} value={p.i}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Details</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional), e.g. Inter-College Final"
            aria-label="Title"
          />
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue / court" aria-label="Venue" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" />
          </div>
          <h3 className="pt-2 text-sm font-semibold">Match rules</h3>
          <RulesFields key={sport} rules={rules} setLabel={SPORTS[sport].setLabel} onChange={setRules} sport={sport} />
        </section>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <ActionBar>
        <button type="submit" disabled={busy} className="btn-grad w-full rounded-xl py-3 font-semibold disabled:opacity-60">
          {step < 3 ? "Next" : busy ? "Saving players…" : "Create team tie"}
        </button>
      </ActionBar>
    </form>
  );
}
