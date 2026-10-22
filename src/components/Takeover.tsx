"use client";

import { useEffect, useState } from "react";
import {
  TAKEOVER_SECONDS,
  cancelTakeover,
  isOrganiser,
  pendingTakeover,
  requestTakeover,
  respondToTakeover,
  settleTakeover,
} from "@/lib/rally/mutations";
import type { Match, TakeoverRequest } from "@/lib/rally/types";
import { updateMatch } from "@/lib/store";
import { Sheet } from "./Sheet";

/** Current time, ticking while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function secondsLeft(request: TakeoverRequest, now: number): number {
  const left = Math.ceil((new Date(request.expiresAt).getTime() - now) / 1000);
  return Math.min(TAKEOVER_SECONDS, Math.max(0, left));
}

/**
 * While a request is pending, every device with the scorer screen open checks whether its time is up and
 * completes it. That way the hand-over happens even if the current scorer's phone is dead.
 */
export function useTakeoverSettler(match: Match) {
  const pendingId = pendingTakeover(match)?.id;
  useEffect(() => {
    if (!pendingId) return;
    const timer = setInterval(() => updateMatch(match.id, (m) => settleTakeover(m)), 500);
    return () => clearInterval(timer);
  }, [match.id, pendingId]);
}

/** Pop-up shown to the current scorer when someone asks to take over. */
export function TakeoverPrompt({ match, user }: { match: Match; user: string }) {
  const pending = pendingTakeover(match);
  const now = useNow(!!pending);
  const [error, setError] = useState<string | null>(null);
  if (!pending || pending.to !== user || match.activeScorer !== user) return null;
  const left = secondsLeft(pending, now);
  const answer = (allow: boolean) => setError(updateMatch(match.id, (m) => respondToTakeover(m, user, allow)));

  return (
    // Tapping outside does nothing: not answering means scoring passes on when the time is up.
    <Sheet title="Take-over request" onClose={() => {}}>
      <p className="text-sm">
        <strong>{pending.from}</strong> wants to take over scoring this match.
      </p>
      <div className="my-4 flex items-center gap-3">
        <span className="tabular flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-live text-2xl font-black text-live">
          {left}
        </span>
        <p className="text-sm text-muted">
          If you don&rsquo;t decline within {left} second{left === 1 ? "" : "s"}, scoring passes to {pending.from} automatically.
        </p>
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => answer(false)} className="rounded-xl bg-danger py-3 font-bold text-white">
          Decline
        </button>
        <button type="button" onClick={() => answer(true)} className="rounded-xl border border-border py-3 font-bold">
          Allow
        </button>
      </div>
    </Sheet>
  );
}

/** Card for someone with access who is not scoring: request a take-over and follow its progress. */
export function TakeoverCard({ match, user }: { match: Match; user: string }) {
  const request = match.takeoverRequest;
  const pending = pendingTakeover(match);
  const now = useNow(!!pending);
  const [error, setError] = useState<string | null>(null);
  const run = (mutation: (m: Match) => Match) => setError(updateMatch(match.id, mutation));
  const myPending = pending?.from === user;
  const declined = request?.status === "declined" && request.from === user && request.to === match.activeScorer;

  if (isOrganiser(match, user)) {
    return (
      <div className="rounded-2xl border-2 border-border bg-surface p-4">
        <p className="font-semibold">
          {match.activeScorer ? `${match.activeScorer} is scoring this match` : "Nobody is scoring right now"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {pending
            ? `${pending.from} has asked to take over. `
            : ""}
          As organiser you can take over immediately; the current scorer is not asked. You can also remove a scorer
          or add another one below.
        </p>
        <button
          type="button"
          onClick={() => run((m) => requestTakeover(m, user))}
          className="mt-3 w-full rounded-xl bg-foreground py-3 font-bold text-background"
        >
          Take over now
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-border bg-surface p-4">
      <p className="font-semibold">
        {match.activeScorer ? `${match.activeScorer} is scoring this match` : "Nobody is scoring right now"}
      </p>

      {myPending ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="tabular flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-accent text-xl font-black text-accent">
              {secondsLeft(pending!, now)}
            </span>
            <p className="text-sm text-muted">
              Asked {pending!.to} to hand over. Scoring passes to you in {secondsLeft(pending!, now)}s unless they decline.
            </p>
          </div>
          <button
            type="button"
            onClick={() => run((m) => cancelTakeover(m, user))}
            className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-medium"
          >
            Cancel request
          </button>
        </>
      ) : pending ? (
        <p className="mt-1 text-sm text-muted">{pending.from} has asked to take over. Wait for that request to finish.</p>
      ) : (
        <>
          {declined ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{request!.to} declined your request to take over.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {match.activeScorer
                ? `Only one person scores at a time. ${match.activeScorer} gets ${TAKEOVER_SECONDS} seconds to decline; if they don't answer (e.g. their phone has died) scoring passes to you and you carry on from the current score.`
                : "Take over to continue scoring from the current score."}
            </p>
          )}
          <button
            type="button"
            onClick={() => run((m) => requestTakeover(m, user))}
            className="mt-3 w-full rounded-xl bg-foreground py-3 font-bold text-background"
          >
            {match.activeScorer ? (declined ? "Request again" : "Request to take over") : "Take over scoring"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
