"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RulesFields } from "@/components/RulesFields";
import { SystemPicker } from "@/components/SystemPicker";
import { MutationError } from "@/lib/rally/mutations";
import { matchingPreset } from "@/lib/rally/presets";
import { describeRules } from "@/lib/rally/rules";
import { FORMAT_LABELS, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { MatchFormat, RallyRules, SportKey } from "@/lib/rally/types";
import { tieSystem } from "@/lib/tie/systems";
import { createTournament, sportFormats, usesTies } from "@/lib/tournament/mutations";
import { TEMPLATES, type TournamentTemplate } from "@/lib/tournament/presets";
import { OFFICIAL_RANKING, RANKINGS, type RankingKey } from "@/lib/tournament/ranking";
import type { Structure } from "@/lib/tournament/types";
import { saveTournament, useUser } from "@/lib/store";

export const STRUCTURES: { key: Structure; title: string; text: string }[] = [
  { key: "league", title: "League", text: "Everyone plays everyone. The points table decides the winner." },
  { key: "knockout", title: "Knockout", text: "Seeded bracket; lose once and you're out. Top seeds get byes." },
  {
    key: "groups_knockout",
    title: "Groups → Knockout",
    text: "Groups play a league with their own points tables; the top teams of each group go into a knockout.",
  },
];

/** The ranking choices for a sport: its governing body's, or custom points. */
export function rankingChoices(sport: SportKey): RankingKey[] {
  return [OFFICIAL_RANKING[sport], "custom"];
}

export function TournamentForm() {
  const router = useRouter();
  const user = useUser();
  const [name, setName] = useState("");
  const [sport, setSport] = useState<SportKey>("badminton");
  const [template, setTemplate] = useState<string | null>(null);
  const [format, setFormat] = useState<MatchFormat>("singles");
  const [structure, setStructure] = useState<Structure>("groups_knockout");
  const [rules, setRules] = useState<RallyRules>(SPORTS.badminton.rules);
  const [ranking, setRanking] = useState<RankingKey>(OFFICIAL_RANKING.badminton);
  const [win, setWin] = useState("2");
  const [loss, setLoss] = useState("0");
  const [legs, setLegs] = useState<1 | 2>(1);
  const [venue, setVenue] = useState("");
  const [courts, setCourts] = useState("Court 1, Court 2");
  const [startDate, setStartDate] = useState("");
  const [city, setCity] = useState("");
  const [tieMatchCount, setTieMatchCount] = useState(5);
  const [system, setSystem] = useState("");
  const [thirdPlace, setThirdPlace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped when a template replaces the rules, so the rules editor re-opens on the presets.
  const [rulesKey, setRulesKey] = useState(0);
  const config = SPORTS[sport];
  const ties = usesTies({ sport, format });

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
    setRanking(OFFICIAL_RANKING[next]);
    setSystem("");
    setTemplate(null);
    setRulesKey((k) => k + 1);
    if (!sportFormats(next).includes(format)) setFormat(sportFormats(next)[0]);
  }

  function applyTemplate(tpl: TournamentTemplate) {
    const s = tpl.settings(sport);
    setTemplate(tpl.key);
    setStructure(s.structure);
    setRules(s.rules);
    setRanking(s.ranking);
    setWin(String(s.points.win));
    setLoss(String(s.points.loss));
    setThirdPlace(s.thirdPlace);
    setLegs(s.legs);
    if (s.team) setFormat("team");
    else if (format === "team" || !sportFormats(sport).includes(format)) setFormat(sportFormats(sport)[0]);
    setSystem(s.tieSystem ?? "");
    setRulesKey((k) => k + 1);
  }

  function submit() {
    const points = { win: Number(win), loss: Number(loss) };
    if (ranking === "custom" && (!Number.isInteger(points.win) || !Number.isInteger(points.loss) || points.win <= points.loss)) {
      setError("Points for a win must be a whole number higher than points for a loss.");
      return;
    }
    try {
      const t = createTournament({
        name,
        sport,
        format,
        venue,
        startDate,
        organiser: user!,
        rules,
        points: ranking === "custom" ? points : { win: 2, loss: 0 },
        ranking,
        legs: structure === "knockout" ? 1 : legs,
        structure,
        thirdPlace: structure !== "league" && thirdPlace,
        courts: courts.split(",").map((c) => c.trim()).filter(Boolean),
        city,
        tieMatchCount,
        tieSystem: ties && system ? system : undefined,
      });
      saveTournament(t);
      router.push(`/tournaments/${t.id}`);
    } catch (e) {
      if (e instanceof MutationError) setError(e.message);
      else throw e;
    }
  }

  const summary = [
    STRUCTURES.find((s) => s.key === structure)!.title + (structure !== "knockout" && legs === 2 ? " (home and away)" : ""),
    FORMAT_LABELS[format],
    ties ? (tieSystem(system)?.label ?? `${tieMatchCount}-match ties`) : null,
    matchingPreset(sport, rules)?.label ?? describeRules(rules, config.setLabel),
    structure !== "knockout" ? `${RANKINGS[ranking].label} table` : null,
    structure !== "league" && thirdPlace ? "third-place match" : null,
  ].filter(Boolean);

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
            <span className="mb-1 block text-sm font-medium">City</span>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Patna" />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-sm font-medium">Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Courts / tables</span>
          <input value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="Court 1, Court 2" />
          <span className="mt-1 block text-xs text-muted">Comma separated. Used when scheduling matches; you can change them later.</span>
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Sport</h2>
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
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Start from a template</h2>
          <p className="text-xs text-muted">Not sure how to set it up? Pick the closest one; every setting below stays editable.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.filter((tpl) => tpl.sports.includes(sport)).map((tpl) => (
            <button
              key={tpl.key}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className={`rounded-xl border p-3 text-left ${template === tpl.key ? "border-2 border-foreground" : "border-border bg-surface"}`}
            >
              <span className="block font-semibold">{tpl.label}</span>
              <span className="block text-xs font-medium text-accent">{tpl.who}</span>
              <span className="mt-1 block text-xs text-muted">{tpl.text}</span>
            </button>
          ))}
        </div>
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span className="font-semibold">You&rsquo;ll get: </span>
          {summary.join(" · ")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Entries</h2>
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
        {ties && (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <p className="text-sm font-medium">Team tie format</p>
            <SystemPicker sport={sport} value={system} onChange={setSystem} />
            {!system && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Matches per tie</span>
                <select value={tieMatchCount} onChange={(e) => setTieMatchCount(Number(e.target.value))}>
                  {[1, 3, 5, 7, 9].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "match" : `matches (first to ${Math.floor(n / 2) + 1} wins)`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted">Each fixture is a team tie. Line-ups are picked on the tie page before each match.</p>
          </div>
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
        {structure !== "knockout" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={legs === 2} onChange={(e) => setLegs(e.target.checked ? 2 : 1)} />
            Play each opponent twice (home and away)
          </label>
        )}
        {structure !== "league" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} />
            Add a third-place match between the semi-final losers
          </label>
        )}
        <p className="text-xs text-muted">You can still change the structure until fixtures are generated.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Match rules</h2>
        <p className="text-xs text-muted">Used for every match. Scorers can still adjust a match before or during play.</p>
        <RulesFields key={`${sport}-${rulesKey}`} rules={rules} setLabel={config.setLabel} onChange={setRules} sport={sport} />
      </section>

      {structure !== "knockout" && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Points table</h2>
          <div className="space-y-2">
            {rankingChoices(sport).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRanking(key)}
                className={`block w-full rounded-xl border p-3 text-left ${ranking === key ? "border-2 border-foreground" : "border-border bg-surface"}`}
              >
                <span className="font-semibold">{RANKINGS[key].label}</span>
                <span className="mt-0.5 block text-xs text-muted">{RANKINGS[key].points}</span>
                <span className="mt-0.5 block text-xs text-muted">{RANKINGS[key].order}</span>
              </button>
            ))}
          </div>
          {ranking === "custom" && (
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
          )}
        </section>
      )}

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-foreground py-3 font-semibold text-background">
        Create tournament
      </button>
    </form>
  );
}
