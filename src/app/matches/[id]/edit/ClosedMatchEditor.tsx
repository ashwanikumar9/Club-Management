"use client";

import Link from "next/link";
import { use, useState } from "react";
import { MatchGate, Scoreboard, matchSubtitle, sideBg, useMatchView } from "@/components/match-ui";
import { describePoint, playerName } from "@/lib/rally/commentary";
import { other, type MatchState, type PointResult } from "@/lib/rally/engine";
import { OutcomePicker } from "@/components/OutcomePicker";
import { computeState, rulesResolver } from "@/lib/rally/engine";
import { deletePoint, describeOutcome, editPoint, insertPoint, isOrganiser, reopenMatch, setOutcome } from "@/lib/rally/mutations";
import { SPORTS } from "@/lib/rally/sports";
import type { Match, SideKey } from "@/lib/rally/types";
import { updateMatch, useUser } from "@/lib/store";

/** Organiser-only correction of a closed match: edit, insert or delete any point, or re-open. */
export function ClosedMatchEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { match, state } = useMatchView(id);
  const user = useUser();

  return (
    <MatchGate match={match}>
      {(m) => {
        if (!user || !isOrganiser(m, user))
          return <Notice match={m} text={`Only the organiser (${m.organiser}) can edit a closed match.`} />;
        if (m.status !== "closed")
          return <Notice match={m} text="This match is still open. Use Undo on the scorer screen to fix mistakes until the match is closed." />;
        return <Editor match={m} state={state!} by={user} />;
      }}
    </MatchGate>
  );
}

function Notice({ match, text }: { match: Match; text: string }) {
  return (
    <div className="space-y-3 py-6 text-center">
      <p className="text-muted">{text}</p>
      <Link href={`/matches/${match.id}`} className="inline-block font-medium text-side-a underline">
        Back to match
      </Link>
    </div>
  );
}

function Editor({ match, state, by }: { match: Match; state: MatchState; by: string }) {
  const [error, setError] = useState<string | null>(null);
  const sport = SPORTS[match.sport];
  const run = (mutation: (m: Match) => Match) => setError(updateMatch(match.id, mutation));

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{matchSubtitle(match)}</p>
          <h1 className="text-xl font-bold">Correct points</h1>
        </div>
        <Link href={`/matches/${match.id}`} className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">
          Done
        </Link>
      </div>

      <Scoreboard match={match} state={state} compact />

      <p className="text-sm text-muted">
        Every change recalculates the score, winner and commentary, and is recorded in the change log below.
      </p>

      {!computeState(match.events, rulesResolver(match)).winner && (
        <OutcomeEditor match={match} by={by} run={run} played={state.points.length > 0} />
      )}

      {error && (
        <button type="button" onClick={() => setError(null)} className="w-full rounded-lg bg-danger/10 px-3 py-2 text-left text-sm text-danger">
          {error}
        </button>
      )}

      <ol className="space-y-1.5">
        {state.points.map((p, index) => {
          const header = index === 0 || state.points[index - 1].setIndex !== p.setIndex;
          return (
            <li key={p.event.id}>
              {header && (
                <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  {sport.setLabel} {p.setIndex + 1}
                </div>
              )}
              <InsertButtons onInsert={(side) => run((m) => insertPoint(m, by, side, p.event.id))} match={match} />
              <PointRow match={match} point={p} index={index} run={run} by={by} />
            </li>
          );
        })}
      </ol>
      <InsertButtons onInsert={(side) => run((m) => insertPoint(m, by, side, null))} match={match} label="Add point at end" />

      <button
        type="button"
        onClick={() => run((m) => reopenMatch(m, by))}
        className="w-full rounded-xl border border-border bg-surface py-3 font-medium"
      >
        Re-open match for live scoring
      </button>

      <section>
        <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Change log</h2>
        <ol className="space-y-1 text-sm">
          {[...match.history].reverse().map((h) => (
            <li key={h.id} className="rounded-lg bg-surface px-3 py-2">
              <span className="text-xs text-muted">
                {new Date(h.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · {h.by}
              </span>
              <p>{h.summary}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function InsertButtons({ match, onInsert, label = "Insert missed point here" }: { match: Match; onInsert: (side: SideKey) => void; label?: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none py-0.5 text-center text-xs text-muted hover:text-foreground">＋ {label}</summary>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {(["A", "B"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={(e) => {
              onInsert(side);
              (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
            }}
            className={`rounded-lg py-2 text-sm font-semibold text-white ${sideBg[side]}`}
          >
            Point to {match.sides[side].name}
          </button>
        ))}
      </div>
    </details>
  );
}

function PointRow({
  match,
  point,
  index,
  run,
  by,
}: {
  match: Match;
  point: PointResult;
  index: number;
  run: (mutation: (m: Match) => Match) => void;
  by: string;
}) {
  const event = point.event;
  const credit = event.action?.credit ?? "winner";
  const playerSide = credit === "error" ? other(event.side) : event.side;
  const players = match.sides[playerSide].players;
  const actionOptions = match.actions.filter((a) => a.enabled || a.key === event.action?.key);

  return (
    <div className={`rounded-xl border border-border bg-surface p-3 ${point.ignored ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="tabular w-7 text-xs text-muted">#{index + 1}</span>
        <button
          type="button"
          title="Switch side"
          onClick={() => run((m) => editPoint(m, by, event.id, { side: other(event.side) }))}
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${sideBg[event.side]}`}
        >
          {match.sides[event.side].name} ⇄
        </button>
        <span className="tabular ml-auto font-semibold">
          {point.score.A}–{point.score.B}
        </span>
        <button
          type="button"
          onClick={() => run((m) => deletePoint(m, by, event.id))}
          className="rounded px-2 text-danger"
          aria-label="Delete point"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm">
        {describePoint(match, event)}
        {point.ignored && <span className="text-xs text-muted"> (after match end, not counted)</span>}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={event.action?.key ?? ""}
          onChange={(e) => run((m) => editPoint(m, by, event.id, { actionKey: e.target.value || null }))}
          aria-label="How"
          className="text-sm"
        >
          <option value="">Plain point</option>
          {actionOptions.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
        {match.format === "singles" || players.length === 0 ? (
          <span />
        ) : (
          <select
            value={event.actorId ?? ""}
            onChange={(e) => run((m) => editPoint(m, by, event.id, { actorId: e.target.value || null }))}
            aria-label="Who"
            className="text-sm"
          >
            <option value="">{credit === "error" ? "Who erred?" : "Who scored?"}</option>
            {players.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {playerName(match, playerSide, pl.id)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

/** For matches closed without a finish: change the retirement / walkover / no-result decision. */
function OutcomeEditor({
  match,
  by,
  run,
  played,
}: {
  match: Match;
  by: string;
  run: (mutation: (m: Match) => Match) => void;
  played: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Result</h2>
      <p className="mt-1 text-sm">{match.outcome ? describeOutcome(match, match.outcome) : "Not recorded"}</p>
      {open ? (
        <div className="mt-3">
          <OutcomePicker
            match={match}
            kinds={played ? ["retired"] : ["retired", "walkover"]}
            initial={match.outcome}
            confirmLabel="Save result"
            onCancel={() => setOpen(false)}
            onConfirm={(outcome) => {
              run((m) => setOutcome(m, by, outcome));
              setOpen(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
          Change result
        </button>
      )}
    </section>
  );
}
