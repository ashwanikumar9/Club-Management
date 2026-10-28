"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IdentityForm } from "@/components/IdentityForm";
import { cardPlayer, checkPlayers, emptyPlayer, PlayerInput, resolvePlayers, type PlayerDraft } from "@/components/PlayerInput";
import { RulesFields } from "@/components/RulesFields";
import { TeamPicker } from "@/components/TeamBits";
import { ActionBar, StepHeader } from "@/components/Wizard";
import { IDENTITY_ICON, identityKind } from "@/lib/identity";
import { createMatch } from "@/lib/rally/mutations";
import { validateRules } from "@/lib/rally/rules";
import { sportFormats } from "@/lib/tournament/mutations";
import { FORMAT_LABELS, SPORT_ICON, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { MatchFormat, RallyRules, SideKey, SportKey } from "@/lib/rally/types";
import { saveMatch, useUser } from "@/lib/store";

interface SideForm {
  name: string;
  players: PlayerDraft[];
}

const playerCount: Record<MatchFormat, number> = { singles: 1, doubles: 2, team: 6 };

function emptySide(format: MatchFormat): SideForm {
  return { name: "", players: Array.from({ length: playerCount[format] }, emptyPlayer) };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function NewMatchForm() {
  const router = useRouter();
  const [sport, setSport] = useState<SportKey>("badminton");
  const [format, setFormat] = useState<MatchFormat>("singles");
  const [rules, setRules] = useState<RallyRules>(SPORTS.badminton.rules);
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [livestreamUrl, setLivestreamUrl] = useState("");
  const [sides, setSides] = useState<Record<SideKey, SideForm>>({ A: emptySide("singles"), B: emptySide("singles") });
  const [scorers, setScorers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const user = useUser();

  const config = SPORTS[sport];

  function chooseSport(next: SportKey) {
    const nextFormat = sportFormats(next).includes(format) ? format : sportFormats(next)[0];
    setSport(next);
    setRules(SPORTS[next].rules);
    chooseFormat(nextFormat);
  }

  function chooseFormat(next: MatchFormat) {
    setFormat(next);
    setSides((prev) => {
      const resize = (side: SideForm): SideForm => {
        const players = side.players.slice(0, Math.max(playerCount[next], next === "team" ? side.players.length : 0));
        while (players.length < playerCount[next]) players.push(emptyPlayer());
        return { ...side, players };
      };
      return { A: resize(prev.A), B: resize(prev.B) };
    });
  }

  function updateSide(side: SideKey, change: Partial<SideForm>) {
    setSides((prev) => ({ ...prev, [side]: { ...prev[side], ...change } }));
  }

  function updatePlayer(side: SideKey, index: number, next: PlayerDraft) {
    updateSide(side, { players: sides[side].players.map((p, i) => (i === index ? next : p)) });
  }

  const drafts = (side: SideKey) =>
    sides[side].players.map((draft, i) => ({ draft, label: format === "singles" ? `Side ${side}'s player` : `Side ${side} player ${i + 1}` }));

  async function submit() {
    if (!user || busy) return;
    const invalidRules = validateRules(rules);
    if (invalidRules) return setError(invalidRules);
    // Check both sides before any player card is made.
    for (const side of ["A", "B"] as const) {
      const checked = checkPlayers(drafts(side));
      if ("error" in checked) return setError(checked.error);
      if (format !== "team" && checked.rows.length < playerCount[format])
        return setError(format === "singles" ? "Enter both players' name and mobile number." : `Enter both players of side ${side}.`);
      if (format === "team" && !sides[side].name.trim()) return setError("Enter both team names.");
    }
    setBusy(true);
    const players: Partial<Record<SideKey, { cardId: string; name: string; jersey?: string }[]>> = {};
    for (const side of ["A", "B"] as const) {
      const r = await resolvePlayers(drafts(side), user, sport);
      if ("error" in r) {
        setBusy(false);
        return setError(r.error);
      }
      players[side] = r.players;
    }
    const sideInput = (side: SideKey) => {
      const list = players[side]!;
      const name = format === "singles" ? list[0].name : sides[side].name.trim() || list.map((p) => p.name.split(" ")[0]).join(" / ");
      return { name, players: list };
    };
    const match = createMatch({
      sport,
      title,
      venue,
      livestreamUrl,
      format,
      rules,
      sides: { A: sideInput("A"), B: sideInput("B") },
      organiser: user,
      scorers,
    });
    saveMatch(
      date || time ? { ...match, schedule: { date: date || undefined, time: time || undefined, court: venue.trim() || undefined } } : match,
    );
    router.push(`/matches/${match.id}/score`);
  }

  if (!user) {
    return (
      <div className="space-y-3 py-6 text-center">
        <h1 className="text-xl font-bold">New match</h1>
        <p className="text-muted">Sign in first (top right). You become the organiser of matches you create.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 3) void submit();
      }}
    >
      <StepHeader
        step={step}
        total={3}
        title={step === 1 ? "Which sport?" : step === 2 ? `${config.name} match` : "Players"}
        onBack={() => setStep((step - 1) as 1 | 2)}
      />

      {step === 1 && (
        <section className="grid gap-3">
          {SPORT_LIST.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                if (s.key !== sport) chooseSport(s.key);
                setStep(2);
              }}
              className={`sport-${s.key} sport-tile flex items-center gap-4 rounded-2xl p-4 text-left shadow-sm active:scale-[0.99]`}
            >
              <span className="text-4xl" aria-hidden>
                {SPORT_ICON[s.key]}
              </span>
              <span>
                <span className="block text-lg font-semibold">{s.name}</span>
                <span className="block text-sm text-muted">{s.formats.map((f) => FORMAT_LABELS[f]).join(" · ")}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          {sportFormats(sport).length > 1 && (
            <div className="flex gap-2">
              {sportFormats(sport).map((f) => (
                <button
                  key={f}
                  type="button"
                  // Badminton / table tennis team events are ties of several matches.
                  onClick={() => (f === "team" && sport !== "volleyball" ? router.push("/ties/new") : chooseFormat(f))}
                  className={`flex-1 rounded-lg border py-2 text-sm ${
                    format === f ? "opt-on font-semibold" : "border-border bg-surface text-muted"
                  }`}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <h2 className="font-semibold">Rules</h2>
            <p className="text-xs text-muted">The scorer can still change them before the start and during the match.</p>
            <RulesFields key={sport} rules={rules} setLabel={config.setLabel} onChange={setRules} sport={sport} />
          </div>
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <ActionBar>
            <button
              type="button"
              onClick={() => {
                const invalid = validateRules(rules);
                setError(invalid);
                if (!invalid) setStep(3);
              }}
              className="btn-grad w-full rounded-xl py-3 font-semibold"
            >
              Next: players
            </button>
          </ActionBar>
        </section>
      )}

      {step === 3 && (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            {(["A", "B"] as const).map((side) => (
              <div key={side} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div className={`text-sm font-bold ${side === "A" ? "text-side-a" : "text-side-b"}`}>Side {side}</div>
                {format === "singles" ? (
                  <PlayerInput value={sides[side].players[0]} onChange={(next) => updatePlayer(side, 0, next)} label={`Side ${side} player`} sport={sport} />
                ) : (
                  <>
                    {format === "team" && <TeamPicker sport={sport} onPick={(t) => updateSide(side, { name: t.name, players: t.players.length ? t.players.map(cardPlayer) : sides[side].players })} />}
                    <Field label={format === "doubles" ? "Pair name (optional)" : "Team name"}>
                      <input
                        value={sides[side].name}
                        onChange={(e) => updateSide(side, { name: e.target.value })}
                        placeholder={format === "doubles" ? "e.g. Meera / Karan" : "e.g. Eagles"}
                      />
                    </Field>
                    <div className="space-y-2">
                      {sides[side].players.map((p, i) => (
                        <PlayerInput
                          key={i}
                          value={p}
                          onChange={(next) => updatePlayer(side, i, next)}
                          label={`Side ${side} player ${i + 1}`}
                          sport={sport}
                          jersey={format === "team"}
                        />
                      ))}
                      {format === "team" && (
                        <button
                          type="button"
                          className="text-sm font-medium text-side-a"
                          onClick={() => updateSide(side, { players: [...sides[side].players, emptyPlayer()] })}
                        >
                          + Add player
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </section>

          <details className="rounded-2xl border border-border bg-surface p-4">
            <summary className="cursor-pointer font-semibold">More options</summary>
            <p className="mt-1 text-xs text-muted">Scorers, title, venue, date and time, livestream. All optional.</p>
            <section className="mt-4 space-y-3">
              <h2 className="font-semibold">Scorers</h2>
              <p className="text-xs text-muted">
                You ({user}) can always score as organiser. Add people who may score this match; one scores at a time and any of them can
                take over, e.g. if a phone dies. Scorers can add more people later.
              </p>
              {scorers.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {scorers.map((s) => (
                    <li key={s} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                      {IDENTITY_ICON[identityKind(s)]} {s}
                      <button
                        type="button"
                        aria-label={`Remove ${s}`}
                        onClick={() => setScorers(scorers.filter((x) => x !== s))}
                        className="rounded-full px-2 text-muted"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <IdentityForm
                submitLabel="Add"
                onSubmit={(key) => {
                  if (key === user) return "You're the organiser, so you can already score.";
                  if (scorers.includes(key)) return `${key} is already added.`;
                  setScorers([...scorers, key]);
                  return null;
                }}
              />
            </section>

            <section className="mt-6 space-y-3">
              <h2 className="font-semibold">Details</h2>
              <Field label="Title / category">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Men's Singles · Quarter-final" />
              </Field>
              <Field label="Venue / court">
                <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Court 2" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" hint="Optional">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Start time" hint="Optional">
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
              </div>
              <Field label="Livestream link" hint="Optional. Shown as a Watch live button on the public page.">
                <input type="url" value={livestreamUrl} onChange={(e) => setLivestreamUrl(e.target.value)} placeholder="https://" />
              </Field>
            </section>
          </details>

          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <ActionBar>
            <button type="submit" disabled={busy} className="btn-grad w-full rounded-xl py-3 font-semibold disabled:opacity-60">
              {busy ? "Saving players…" : "Create match & start scoring"}
            </button>
          </ActionBar>
        </>
      )}
    </form>
  );
}
