"use client";

import Link from "next/link";
import { use, useState } from "react";
import { CommentaryFeed, MatchGate, Scoreboard, matchSubtitle, sideBg, useMatchView } from "@/components/match-ui";
import { Sheet } from "@/components/Sheet";
import { describePoint, playerName } from "@/lib/rally/commentary";
import { other, type MatchState } from "@/lib/rally/engine";
import { addPoint, closeMatch, setLatestPointDetail, startMatch, undoLast, updateSettings } from "@/lib/rally/mutations";
import { SPORTS } from "@/lib/rally/sports";
import type { ActionCredit, Match, SideKey } from "@/lib/rally/types";
import { updateMatch, useRole } from "@/lib/store";

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
  const role = useRole();
  const by = role === "organiser" ? "Organiser" : "Scorer";
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const sport = SPORTS[match.sport];

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
    const err = updateMatch(match.id, (m) => setLatestPointDetail(m, pending.eventId, { actionKey }));
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
    setError(updateMatch(match.id, (m) => setLatestPointDetail(m, pending.eventId, { actorId })));
    setPending(null);
  }

  if (match.status === "scheduled") {
    return (
      <div className="space-y-4">
        <Header match={match} />
        <Scoreboard match={match} state={state} />
        <button
          type="button"
          onClick={() => run(startMatch)}
          className="w-full rounded-2xl bg-accent py-5 text-lg font-bold text-white"
        >
          Start match
        </button>
        <SettingsBar match={match} />
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
          {role === "organiser" ? (
            <p className="mt-1 text-muted">As organiser you can correct points or re-open the match.</p>
          ) : (
            <p className="mt-1 text-muted">Scores can no longer be changed by scorers. Ask the organiser for corrections.</p>
          )}
          {role === "organiser" && (
            <Link href={`/matches/${match.id}/edit`} className="mt-3 inline-block rounded-lg bg-foreground px-4 py-2 font-semibold text-background">
              Edit points
            </Link>
          )}
        </div>
        <CommentaryFeed match={match} lines={commentary} />
      </div>
    );
  }

  const pendingSide = pending ? (pending.step === "who" && pending.credit === "error" ? other(pending.side) : pending.side) : null;

  return (
    <div className="space-y-3 pb-6">
      <Header match={match} />
      <Scoreboard match={match} state={state} compact />

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

      <SettingsBar match={match} />

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

function SettingsBar({ match }: { match: Match }) {
  const toggle = (key: "askHow" | "askWho") =>
    updateMatch(match.id, (m) => updateSettings(m, { [key]: !m.settings[key] }));
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
