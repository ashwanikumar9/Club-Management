"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RulesFields } from "@/components/RulesFields";
import { MutationError } from "@/lib/rally/mutations";
import { SPORTS } from "@/lib/rally/sports";
import type { RallyRules, SideKey } from "@/lib/rally/types";
import { createTie } from "@/lib/tie/tie";
import type { LineupMode, Tie } from "@/lib/tie/types";
import { saveTie, useUser } from "@/lib/store";

interface Row {
  name: string;
  jersey: string;
}

interface Lineup {
  format: "singles" | "doubles";
  A: number[];
  B: number[];
}

const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ name: "", jersey: "" }));

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
  const [matchCount, setMatchCount] = useState(5);
  const [mode, setMode] = useState<LineupMode>("at_start");
  const [lineups, setLineups] = useState<Lineup[]>(defaultLineups(5));
  const [rules, setRules] = useState<RallyRules>(SPORTS.badminton.rules);
  const [error, setError] = useState<string | null>(null);

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

  function submit() {
    try {
      // Line-up positions refer to rows in the form; map them to positions among the named players.
      const position = (side: SideKey, row: number) => named(side).findIndex((p) => p.i === row);
      const tie = createTie({
        sport,
        title,
        venue,
        rules,
        teams: {
          A: { name: teams.A.name, players: teams.A.players },
          B: { name: teams.B.name, players: teams.B.players },
        },
        matchCount,
        lineupMode: mode,
        lineups:
          mode === "advance"
            ? lineups.map((l) => ({ format: l.format, A: l.A.map((r) => position("A", r)), B: l.B.map((r) => position("B", r)) }))
            : undefined,
        organiser: user!,
      });
      saveTie(date || time ? { ...tie, schedule: { date: date || undefined, time: time || undefined, court: venue.trim() || undefined } } : tie);
      router.push(`/ties/${tie.id}`);
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  return (
    <form
      className="space-y-6 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <h1 className="text-xl font-bold">New team tie</h1>
        <p className="text-sm text-muted">Two teams play several singles and doubles matches; the first team to win the majority wins.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["badminton", "table_tennis"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSport(s);
              setRules(SPORTS[s].rules);
            }}
            className={`rounded-xl border px-2 py-3 text-sm font-semibold ${sport === s ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`}
          >
            {SPORTS[s].name}
          </button>
        ))}
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((side) => (
          <div key={side} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
            <div className={`text-sm font-bold ${side === "A" ? "text-side-a" : "text-side-b"}`}>Team {side}</div>
            <input value={teams[side].name} onChange={(e) => updateTeam(side, { name: e.target.value })} placeholder="Team name" aria-label={`Team ${side} name`} />
            <span className="block pt-1 text-sm font-medium">Players</span>
            {teams[side].players.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className="!w-16 shrink-0"
                  value={p.jersey}
                  onChange={(e) => updateTeam(side, { players: teams[side].players.map((x, j) => (j === i ? { ...x, jersey: e.target.value } : x)) })}
                  placeholder="#"
                  aria-label="Jersey number"
                />
                <input
                  value={p.name}
                  onChange={(e) => updateTeam(side, { players: teams[side].players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  placeholder={`Player ${i + 1}`}
                  aria-label={`Team ${side} player ${i + 1}`}
                />
              </div>
            ))}
            <button type="button" onClick={() => updateTeam(side, { players: [...teams[side].players, { name: "", jersey: "" }] })} className="text-sm font-medium text-side-a">
              + Add player
            </button>
          </div>
        ))}
      </section>

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
                className={`rounded-lg border py-2 text-sm ${mode === key ? "border-foreground font-semibold" : "border-border text-muted"}`}
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
                    setLineups((prev) => prev.map((x, i) => (i === index ? { format: e.target.value as Lineup["format"], A: [], B: [] } : x)))
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

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Details</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional), e.g. Inter-College Final" aria-label="Title" />
        <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue / court" aria-label="Venue" />
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" />
        </div>
        <h3 className="pt-2 text-sm font-semibold">Match rules</h3>
        <RulesFields rules={rules} setLabel={SPORTS[sport].setLabel} onChange={setRules} />
      </section>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-foreground py-3 font-semibold text-background">
        Create team tie
      </button>
    </form>
  );
}
