"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { RulesFields } from "@/components/RulesFields";
import { createMatch } from "@/lib/rally/mutations";
import { validateRules } from "@/lib/rally/rules";
import { FORMAT_LABELS, SPORT_LIST, SPORTS } from "@/lib/rally/sports";
import type { MatchFormat, RallyRules, SideKey, SportKey } from "@/lib/rally/types";
import { saveMatch } from "@/lib/store";

interface PlayerRow {
  name: string;
  jersey: string;
}

interface SideForm {
  name: string;
  players: PlayerRow[];
}

const playerCount: Record<MatchFormat, number> = { singles: 1, doubles: 2, team: 6 };

function emptySide(format: MatchFormat): SideForm {
  return { name: "", players: Array.from({ length: playerCount[format] }, () => ({ name: "", jersey: "" })) };
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
  const [livestreamUrl, setLivestreamUrl] = useState("");
  const [sides, setSides] = useState<Record<SideKey, SideForm>>({ A: emptySide("singles"), B: emptySide("singles") });
  const [error, setError] = useState<string | null>(null);

  const config = SPORTS[sport];

  function chooseSport(next: SportKey) {
    const nextFormat = SPORTS[next].formats.includes(format) ? format : SPORTS[next].formats[0];
    setSport(next);
    setRules(SPORTS[next].rules);
    chooseFormat(nextFormat);
  }

  function chooseFormat(next: MatchFormat) {
    setFormat(next);
    setSides((prev) => {
      const resize = (side: SideForm): SideForm => {
        const players = side.players.slice(0, Math.max(playerCount[next], next === "team" ? side.players.length : 0));
        while (players.length < playerCount[next]) players.push({ name: "", jersey: "" });
        return { ...side, players };
      };
      return { A: resize(prev.A), B: resize(prev.B) };
    });
  }

  function updateSide(side: SideKey, change: Partial<SideForm>) {
    setSides((prev) => ({ ...prev, [side]: { ...prev[side], ...change } }));
  }

  function updatePlayer(side: SideKey, index: number, change: Partial<PlayerRow>) {
    const players = sides[side].players.map((p, i) => (i === index ? { ...p, ...change } : p));
    updateSide(side, { players });
  }

  function submit() {
    const names = (side: SideKey) =>
      format === "singles" ? sides[side].players[0].name.trim() : sides[side].name.trim();
    if (!names("A") || !names("B")) {
      setError(format === "singles" ? "Enter both players' names." : "Enter both team names.");
      return;
    }
    const invalidRules = validateRules(rules);
    if (invalidRules) {
      setError(invalidRules);
      return;
    }
    const sideInput = (side: SideKey) => ({ name: names(side), players: sides[side].players });
    const match = createMatch({ sport, title, venue, livestreamUrl, format, rules, sides: { A: sideInput("A"), B: sideInput("B") } });
    saveMatch(match);
    router.push(`/matches/${match.id}/score`);
  }

  return (
    <form
      className="space-y-6 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h1 className="text-xl font-bold">New match</h1>

      <section className="space-y-3">
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
        {config.formats.length > 1 && (
          <div className="flex gap-2">
            {config.formats.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => chooseFormat(f)}
                className={`flex-1 rounded-lg border py-2 text-sm ${
                  format === f ? "border-foreground font-semibold" : "border-border bg-surface text-muted"
                }`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((side) => (
          <div key={side} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
            <div className={`text-sm font-bold ${side === "A" ? "text-side-a" : "text-side-b"}`}>Side {side}</div>
            {format === "singles" ? (
              <Field label="Player name">
                <input
                  value={sides[side].players[0]?.name ?? ""}
                  onChange={(e) => updatePlayer(side, 0, { name: e.target.value })}
                  placeholder={side === "A" ? "e.g. Riya Sharma" : "e.g. Asha Verma"}
                />
              </Field>
            ) : (
              <>
                <Field label={format === "doubles" ? "Pair name" : "Team name"}>
                  <input
                    value={sides[side].name}
                    onChange={(e) => updateSide(side, { name: e.target.value })}
                    placeholder={format === "doubles" ? "e.g. Meera / Karan" : "e.g. Eagles"}
                  />
                </Field>
                <div>
                  <span className="mb-1 block text-sm font-medium">Players</span>
                  <div className="space-y-2">
                    {sides[side].players.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="!w-16 shrink-0"
                          value={p.jersey}
                          onChange={(e) => updatePlayer(side, i, { jersey: e.target.value })}
                          placeholder="#"
                          aria-label="Jersey number"
                          inputMode="numeric"
                        />
                        <input
                          value={p.name}
                          onChange={(e) => updatePlayer(side, i, { name: e.target.value })}
                          placeholder={`Player ${i + 1}`}
                          aria-label="Player name"
                        />
                      </div>
                    ))}
                  </div>
                  {format === "team" && (
                    <button
                      type="button"
                      className="mt-2 text-sm font-medium text-side-a"
                      onClick={() => updateSide(side, { players: [...sides[side].players, { name: "", jersey: "" }] })}
                    >
                      + Add player
                    </button>
                  )}
                  <p className="mt-1 text-xs text-muted">Optional. Used for the &ldquo;who scored&rdquo; prompt.</p>
                </div>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Rules</h2>
        <p className="text-xs text-muted">Pre-filled with standard {config.name} rules. The scorer can still change them before the start and during the match.</p>
        <RulesFields rules={rules} setLabel={config.setLabel} onChange={setRules} />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Details</h2>
        <Field label="Title / category">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Men's Singles · Quarter-final" />
        </Field>
        <Field label="Venue / court">
          <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Court 2" />
        </Field>
        <Field label="Livestream link" hint="Optional. Shown as a Watch live button on the public page.">
          <input type="url" value={livestreamUrl} onChange={(e) => setLivestreamUrl(e.target.value)} placeholder="https://" />
        </Field>
      </section>

      {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <button type="submit" className="w-full rounded-xl bg-foreground py-3 font-semibold text-background">
        Create match
      </button>
    </form>
  );
}
