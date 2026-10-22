"use client";

import Link from "next/link";
import { use, useState } from "react";
import { CommentaryFeed, MatchGate, Scoreboard, matchSubtitle, sideBg, useMatchView } from "@/components/match-ui";
import { Sheet } from "@/components/Sheet";
import { describePoint, playerName } from "@/lib/rally/commentary";
import { other, type MatchState } from "@/lib/rally/engine";
import { RulesFields } from "@/components/RulesFields";
import { ScorersPanel } from "@/components/ScorersPanel";
import { TakeoverCard, TakeoverPrompt, useTakeoverSettler } from "@/components/Takeover";
import {
  addPoint,
  changeRules,
  closeMatch,
  hasScoringAccess,
  isOrganiser,
  setLatestPointDetail,
  startMatch,
  undoLast,
  updateSettings,
} from "@/lib/rally/mutations";
import { describeRules } from "@/lib/rally/rules";
import { SPORTS } from "@/lib/rally/sports";
import type { ActionCredit, Match, RallyRules, SideKey } from "@/lib/rally/types";
import { updateMatch, useUser } from "@/lib/store";

type Pending = { eventId: string; side: SideKey; step: "how" | "who"; credit: ActionCredit };

export function ScorerScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { match, state, commentary } = useMatchView(id);
  return (
    <MatchGate match={match}>
      {(m) => <Scorer match={m} state={state!} commentary={commentary} />}
    </MatchGate>
  );
}

function Scorer({
  match,
  state,
  commentary,
}: {
  match: Match;
  state: MatchState;
  commentary: ReturnType<typeof useMatchView>["commentary"];
}) {
  const user = useUser();
  const by = user ?? "";
  const organiser = isOrganiser(match, user);
  const inControl = !!user && match.activeScorer === user;
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const sport = SPORTS[match.sport];
  useTakeoverSettler(match);

  const enabledActions = match.actions.filter((a) => a.enabled);
  const canAskHow = match.settings.askHow && enabledActions.length > 0;
  const canAskWho = match.settings.askWho && match.format !== "singles";
  const lastPoint = state.points.at(-1);

  function run(mutation: (m: Match) => Match) {
    setError(updateMatch(match.id, mutation));
  }

  function score(side: SideKey) {
    let eventId = null as string | null;
    const err = updateMatch(match.id, (m) => {
      const result = addPoint(m, side, by);
      eventId = result.event.id;
      return result.match;
    });
    setError(err);
    if (err || !eventId) return;
    navigator.vibrate?.(15);
    if (canAskHow) setPending({ eventId, side, step: "how", credit: "winner" });
    else if (canAskWho && match.sides[side].players.length > 0) setPending({ eventId, side, step: "who", credit: "winner" });
  }

  function chooseAction(actionKey: string, credit: ActionCredit) {
    if (!pending) return;
    const err = updateMatch(match.id, (m) => setLatestPointDetail(m, by, pending.eventId, { actionKey }));
    if (err) {
      setError(err);
      setPending(null);
      return;
    }
    const whoSide = credit === "error" ? other(pending.side) : pending.side;
    if (canAskWho && match.sides[whoSide].players.length > 0) setPending({ ...pending, step: "who", credit });
    else setPending(null);
  }

  function choosePlayer(actorId: string) {
    if (!pending) return;
    setError(updateMatch(match.id, (m) => setLatestPointDetail(m, by, pending.eventId, { actorId })));
    setPending(null);
  }

  if (!user || !hasScoringAccess(match, user)) {
    return (
      <div className="space-y-4">
        <Header match={match} />
        <Scoreboard match={match} state={state} />
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">{user ? "You don't have scoring access" : "Sign in to score"}</p>
          <p className="mt-1 text-muted">
            {user
              ? `Ask the organiser or a scorer of this match to add ${user}.`
              : "Sign in (top right) with the mobile number, email or username you were added with."}
          </p>
        </div>
      </div>
    );
  }

  if (match.status === "scheduled") {
    return (
      <div className="space-y-4">
        <Header match={match} />
        <Scoreboard match={match} state={state} />
        <RulesPanel match={match} state={state} by={by} />
        {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={() => run((m) => startMatch(m, by))}
          className="w-full rounded-2xl bg-accent py-5 text-lg font-bold text-white"
        >
          Start match
        </button>
        <p className="-mt-2 text-center text-xs text-muted">You will be the scorer. Anyone below can take over later.</p>
        <SettingsBar match={match} by={by} />
        <ScorersPanel match={match} user={user} />
      </div>
    );
  }

  if (match.status === "closed") {
    return (
      <div className="space-y-4">
        <Header match={match} />
        <Scoreboard match={match} state={state} />
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">This match is closed.</p>
          {organiser ? (
            <p className="mt-1 text-muted">As organiser you can correct points or re-open the match.</p>
          ) : (
            <p className="mt-1 text-muted">Scores can no longer be changed by scorers. Ask the organiser for corrections.</p>
          )}
          {organiser && (
            <Link href={`/matches/${match.id}/edit`} className="mt-3 inline-block rounded-lg bg-foreground px-4 py-2 font-semibold text-background">
              Edit points
            </Link>
          )}
        </div>
        <CommentaryFeed match={match} lines={commentary} />
      </div>
    );
  }

  if (!inControl) {
    return (
      <div className="space-y-4 pb-6">
        <Header match={match} />
        <Scoreboard match={match} state={state} compact />
        <TakeoverCard match={match} user={user} />
        <ScorersPanel match={match} user={user} />
        <section>
          <h2 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Commentary</h2>
          <CommentaryFeed match={match} lines={commentary} limit={12} />
        </section>
      </div>
    );
  }

  const pendingSide = pending ? (pending.step === "who" && pending.credit === "error" ? other(pending.side) : pending.side) : null;

  return (
    <div className="space-y-3 pb-6">
      <Header match={match} />
      <Scoreboard match={match} state={state} compact />
      <RulesPanel match={match} state={state} by={by} />

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error} <span className="float-right">✕</span>
        </button>
      )}

      {state.winner ? (
        <div className="rounded-2xl border-2 border-accent bg-accent/10 p-4 text-center">
          <p className="font-bold">{match.sides[state.winner].name} wins the match</p>
          <p className="text-sm text-muted">Undo if the last point was a mistake, otherwise close the match to confirm the result.</p>
          <button type="button" onClick={() => setConfirmClose(true)} className="mt-3 w-full rounded-xl bg-accent py-3 font-bold text-white">
            Close match
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(["A", "B"] as const).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => score(side)}
              className={`flex h-40 flex-col items-center justify-center rounded-2xl text-white shadow-sm active:scale-[0.98] sm:h-48 ${sideBg[side]}`}
            >
              <span className="text-5xl font-black">+1</span>
              <span className="mt-2 max-w-full truncate px-2 text-sm font-semibold opacity-90">{match.sides[side].name}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!lastPoint}
        onClick={() => lastPoint && run((m) => undoLast(m, lastPoint.event.id, by))}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left disabled:opacity-40"
      >
        <span className="text-xl" aria-hidden>
          ↶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Undo</span>
          <span className="block truncate text-xs text-muted">
            {lastPoint
              ? `${describePoint(match, lastPoint.event)} · ${lastPoint.score.A}–${lastPoint.score.B}`
              : "Nothing to undo yet"}
          </span>
        </span>
      </button>

      <SettingsBar match={match} by={by} />

      <ScorersPanel match={match} user={user} />
      <TakeoverPrompt match={match} user={user} />

      <section>
        <h2 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">Commentary</h2>
        <CommentaryFeed match={match} lines={commentary} limit={12} />
      </section>

      {!state.winner && (
        <button
          type="button"
          onClick={() => setConfirmClose(true)}
          className="w-full rounded-xl border border-border py-3 text-sm font-medium text-muted"
        >
          Close match early…
        </button>
      )}

      {pending && pendingSide && (
        <Sheet
          title={
            pending.step === "how"
              ? `Point to ${match.sides[pending.side].name}: how?`
              : pending.credit === "error"
                ? `Who made the error? (${match.sides[pendingSide].name})`
                : `Who scored? (${match.sides[pendingSide].name})`
          }
          onClose={() => setPending(null)}
        >
          {pending.step === "how" ? (
            <div className="space-y-3">
              {(["winner", "error"] as const).map((credit) => {
                const list = enabledActions.filter((a) => a.credit === credit);
                if (list.length === 0) return null;
                return (
                  <div key={credit}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      {credit === "winner" ? `Winning shot by ${match.sides[pending.side].name}` : `Error by ${match.sides[other(pending.side)].name}`}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {list.map((a) => (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => chooseAction(a.key, a.credit)}
                          className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-left text-sm font-medium"
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {match.sides[pendingSide].players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePlayer(p.id)}
                  className="rounded-xl border border-border bg-surface-2 px-3 py-3 text-left text-sm font-medium"
                >
                  {playerName(match, pendingSide, p.id)}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setPending(null)} className="mt-4 w-full rounded-xl bg-foreground py-3 font-semibold text-background">
            Skip · keep as plain point
          </button>
          <p className="mt-2 text-center text-xs text-muted">The point is already counted. This only adds detail for commentary.</p>
        </Sheet>
      )}

      {confirmClose && (
        <Sheet title="Close match?" onClose={() => setConfirmClose(false)}>
          <p className="text-sm">
            {state.winner
              ? `Final result: ${match.sides[state.winner].name} wins ${state.setsWon[state.winner]}–${state.setsWon[other(state.winner)]}.`
              : `The match is not decided yet (${sport.setLabel.toLowerCase()}s ${state.setsWon.A}–${state.setsWon.B}). Close it anyway, e.g. for a retirement or walkover?`}
          </p>
          <p className="mt-2 text-sm text-muted">After closing, undo is turned off and only the organiser can edit the score.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmClose(false)} className="rounded-xl border border-border py-3 font-medium">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                run((m) => closeMatch(m, by));
                setConfirmClose(false);
              }}
              className="rounded-xl bg-accent py-3 font-bold text-white"
            >
              Close match
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * Rules in force, editable by the scorer: before the start (e.g. local format or weather) and at any
 * time during the match. Live changes apply from the current set onwards.
 */
function RulesPanel({ match, state, by }: { match: Match; state: MatchState; by: string }) {
  const [draft, setDraft] = useState<RallyRules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sport = SPORTS[match.sport];
  const label = sport.setLabel;
  const live = match.status === "live";
  const current = state.currentSet + 1;

  function save() {
    if (!draft) return;
    const err = updateMatch(match.id, (m) => changeRules(m, draft, by));
    setError(err);
    if (!err) setDraft(null);
  }

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-4 ${live ? "py-2" : "py-3"}`}
      >
        <div className="min-w-0 flex-1">
          {!live && <p className="text-sm font-semibold">Match rules</p>}
          <p className="text-xs text-muted">{describeRules(state.rules, label)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDraft({ ...state.rules });
          }}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium"
        >
          {live ? "Change" : "Edit rules"}
        </button>
      </div>
      {draft && (
        <Sheet title={live ? "Change rules during the match" : "Match rules"} onClose={() => setDraft(null)}>
          <p className="mb-3 text-sm text-muted">
            {live
              ? `New rules apply to ${label.toLowerCase()} ${current} (in progress) and every later ${label.toLowerCase()}. Finished ${label.toLowerCase()}s keep their scores.`
              : "Set the rules for this match, e.g. a local points format or shorter games because of the weather. You can still change them during the match."}
          </p>
          <RulesFields rules={draft} setLabel={label} onChange={setDraft} />
          <button
            type="button"
            onClick={() => setDraft({ ...SPORTS[match.sport].rules })}
            className="mt-3 text-sm text-muted underline"
          >
            Use standard {sport.name} rules
          </button>
          {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-xl border border-border py-3 font-medium">
              Cancel
            </button>
            <button type="button" onClick={save} className="rounded-xl bg-foreground py-3 font-bold text-background">
              Save rules
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function Header({ match }: { match: Match }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm text-muted">{matchSubtitle(match)}</p>
      <Link href={`/matches/${match.id}`} className="shrink-0 text-sm font-medium text-side-a">
        Public view →
      </Link>
    </div>
  );
}

function SettingsBar({ match, by }: { match: Match; by: string }) {
  const toggle = (key: "askHow" | "askWho") =>
    updateMatch(match.id, (m) => updateSettings(m, by, { [key]: !m.settings[key] }));
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Ask after each point:</span>
      <button
        type="button"
        aria-pressed={match.settings.askHow}
        onClick={() => toggle("askHow")}
        className={`rounded-full border px-3 py-1 ${match.settings.askHow ? "border-foreground font-semibold" : "border-border text-muted"}`}
      >
        How {match.settings.askHow ? "on" : "off"}
      </button>
      {match.format !== "singles" && (
        <button
          type="button"
          aria-pressed={match.settings.askWho}
          onClick={() => toggle("askWho")}
          className={`rounded-full border px-3 py-1 ${match.settings.askWho ? "border-foreground font-semibold" : "border-border text-muted"}`}
        >
          Who {match.settings.askWho ? "on" : "off"}
        </button>
      )}
      <Link href={`/matches/${match.id}/settings`} className="ml-auto font-medium text-side-a">
        Shot types ⚙
      </Link>
    </div>
  );
}
