"use client";

import { useState } from "react";
import { other } from "@/lib/rally/engine";
import { setToss } from "@/lib/rally/mutations";
import type { Match, SideKey, Toss } from "@/lib/rally/types";
import { updateMatch } from "@/lib/store";
import { sideBg, sideText } from "./match-ui";

const CHOICES: { key: NonNullable<Toss["choice"]>; label: string }[] = [
  { key: "serve", label: "Serve" },
  { key: "receive", label: "Receive" },
  { key: "side", label: "Pick a side" },
];

/**
 * Before the start: flip a coin (or enter who won), record the winner's choice, who serves first and which
 * side starts on the scorer's left. Serving and change of ends are then tracked automatically.
 */
export function TossPanel({ match, by }: { match: Match; by: string }) {
  const [editing, setEditing] = useState(!match.toss);
  const [winner, setWinner] = useState<SideKey | undefined>(match.toss?.winner);
  const [choice, setChoice] = useState<Toss["choice"]>(match.toss?.choice ?? "serve");
  const [firstServer, setFirstServer] = useState<SideKey>(match.toss?.firstServer ?? "A");
  const [left, setLeft] = useState<SideKey>(match.toss?.left ?? "A");
  const [flipping, setFlipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (s: SideKey) => match.sides[s].name;

  function pick(w: SideKey, c = choice) {
    setWinner(w);
    if (c === "serve") setFirstServer(w);
    if (c === "receive") setFirstServer(other(w));
  }

  function flip() {
    setFlipping(true);
    setTimeout(() => {
      pick(Math.random() < 0.5 ? "A" : "B");
      setFlipping(false);
    }, 600);
  }

  if (!editing && match.toss) {
    const t = match.toss;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Toss</p>
          <p className="text-muted">
            {t.winner ? `${name(t.winner)} won${t.choice ? ` and chose to ${t.choice === "side" ? "pick a side" : t.choice}` : ""}. ` : ""}
            {name(t.firstServer)} serves first; {name(t.left)} starts on your left.
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 font-medium">
          Change
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Toss</h2>
        <button type="button" onClick={flip} disabled={flipping} className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background">
          {flipping ? "Flipping…" : "🪙 Flip coin"}
        </button>
      </div>
      <div>
        <p className="mb-1 text-sm text-muted">Who won the toss?</p>
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={winner === s}
              onClick={() => pick(s)}
              className={`truncate rounded-lg border px-2 py-2 text-sm ${winner === s ? `border-transparent font-semibold text-white ${sideBg[s]}` : "border-border"}`}
            >
              {name(s)}
            </button>
          ))}
        </div>
      </div>
      {winner && (
        <div>
          <p className="mb-1 text-sm text-muted">{name(winner)} chooses to…</p>
          <div className="grid grid-cols-3 gap-2">
            {CHOICES.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={choice === c.key}
                onClick={() => {
                  setChoice(c.key);
                  pick(winner, c.key);
                }}
                className={`rounded-lg border py-2 text-sm ${choice === c.key ? "border-foreground font-semibold" : "border-border text-muted"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Serves first</span>
          <select value={firstServer} onChange={(e) => setFirstServer(e.target.value as SideKey)} aria-label="Serves first">
            {(["A", "B"] as const).map((s) => (
              <option key={s} value={s}>
                {name(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">On your left</span>
          <select value={left} onChange={(e) => setLeft(e.target.value as SideKey)} aria-label="Starts on your left">
            {(["A", "B"] as const).map((s) => (
              <option key={s} value={s}>
                {name(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const err = updateMatch(match.id, (m) => setToss(m, by, { winner, choice: winner ? choice : undefined, firstServer, left }));
            setError(err);
            if (!err) setEditing(false);
          }}
          className="flex-1 rounded-xl bg-foreground py-2.5 font-semibold text-background"
        >
          Save toss
        </button>
        {match.toss && (
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-border px-4 font-medium">
            Cancel
          </button>
        )}
      </div>
      <p className={`text-xs ${sideText[firstServer]}`}>Serving and change of ends are tracked automatically from here.</p>
    </section>
  );
}
