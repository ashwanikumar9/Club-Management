"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RulesFields } from "@/components/RulesFields";
import { MutationError } from "@/lib/rally/mutations";
import { FORMAT_LABELS, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { MatchFormat, RallyRules, SportKey } from "@/lib/rally/types";
import { createTournament, sportFormats } from "@/lib/tournament/mutations";
import type { Structure } from "@/lib/tournament/types";
import { saveTournament, useUser } from "@/lib/store";

export const STRUCTURES: { key: Structure; title: string; text: string }[] = [
  { key: "league", title: "League", text: "Everyone plays everyone once. The points table decides the winner." },
  { key: "knockout", title: "Knockout", text: "Seeded bracket; lose once and you're out. Top seeds get byes." },
  {
    key: "groups_knockout",
    title: "Groups → Knockout",
    text: "Groups play a league with their own points tables; the top teams of each group go into a knockout.",
  },
];

export function TournamentForm() {
  const router = useRouter();
  const user = useUser();
  const [name, setName] = useState("");
  const [sport, setSport] = useState<SportKey>("badminton");
  const [format, setFormat] = useState<MatchFormat>("singles");
  const [structure, setStructure] = useState<Structure>("groups_knockout");
  const [rules, setRules] = useState<RallyRules>(SPORTS.badminton.rules);
  const [win, setWin] = useState("2");
  const [loss, setLoss] = useState("0");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const config = SPORTS[sport];

  if (!user) {
    return (
      <div className="space-y-3 py-6 text-center">
        <h1 className="text-xl font-bold">New tournament</h1>
        <p className="text-muted">Sign in first (top right). You become the organiser of tournaments you create.</p>
      </div>
    );
  }

  function chooseSport(next: SportKey) {
    setSport(next);
    setRules(SPORTS[next].rules);
    if (!sportFormats(next).includes(format)) setFormat(sportFormats(next)[0]);
  }

  function submit() {
    const points = { win: Number(win), loss: Number(loss) };
    if (!Number.isInteger(points.win) || !Number.isInteger(points.loss) || points.win <= points.loss) {
      setError("Points for a win must be a whole number higher than points for a loss.");
      return;
    }
    try {
      const t = createTournament({ name, sport, format, venue, startDate, organiser: user!, rules, points, structure });
      saveTournament(t);
      router.push(`/tournaments/${t.id}`);
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
      <h1 className="text-xl font-bold">New tournament</h1>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tournament name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inter-College Sports Meet 2026" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Venue</span>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Main Sports Hall" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Sport and entries</h2>
        <div className="grid grid-cols-3 gap-2">
          {SPORT_LIST.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => chooseSport(s.key)}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold ${
                sport === s.key ? "border-foreground bg-foreground text-background" : "border-border bg-surface"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        {sportFormats(sport).length > 1 && (
          <div className="flex gap-2">
            {sportFormats(sport).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`flex-1 rounded-lg border py-2 text-sm ${format === f ? "border-foreground font-semibold" : "border-border bg-surface text-muted"}`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        )}
        {sport !== "volleyball" && (
          <p className="text-xs text-muted">Team events (several singles and doubles matches per tie) are coming next.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Structure</h2>
        <div className="space-y-2">
          {STRUCTURES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStructure(s.key)}
              className={`block w-full rounded-xl border p-3 text-left ${structure === s.key ? "border-2 border-foreground" : "border-border bg-surface"}`}
            >
              <span className="font-semibold">{s.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{s.text}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">You can still change the structure until fixtures are generated.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Match rules</h2>
        <p className="text-xs text-muted">Used for every match. Scorers can still adjust a match before or during play.</p>
        <RulesFields rules={rules} setLabel={config.setLabel} onChange={setRules} />
      </section>

      {structure !== "knockout" && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Points table</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Points for a win</span>
              <input type="number" inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Points for a loss</span>
              <input type="number" inputMode="numeric" value={loss} onChange={(e) => setLoss(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">
            Ties on points are broken by head-to-head, then {config.setLabel.toLowerCase()} difference, then point difference.
          </p>
        </section>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-foreground py-3 font-semibold text-background">
        Create tournament
      </button>
    </form>
  );
}
