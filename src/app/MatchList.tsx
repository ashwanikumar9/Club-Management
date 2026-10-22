"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ScoreCard } from "@/components/cards/ScoreCard";
import { demoMatches } from "@/lib/demo";
import { eventStatus, knownCities, nearYou, yourEvents, type EventItem, type EventStatus } from "@/lib/home";
import { myCards } from "@/lib/players/cards";
import { hasScoringAccess } from "@/lib/rally/mutations";
import { FORMAT_LABELS, SPORTS } from "@/lib/rally/sports";
import type { Match } from "@/lib/rally/types";
import { readCity, readRecent, saveCity } from "@/lib/recent";
import { tieState } from "@/lib/tie/tie";
import type { Tie } from "@/lib/tie/types";
import { champion, type Data } from "@/lib/tournament/engine";
import { scheduleKey } from "@/lib/tournament/schedule";
import type { Tournament } from "@/lib/tournament/types";
import {
  isRemote,
  saveMatch,
  setUser,
  useMatches,
  useMeets,
  usePlayerContacts,
  usePlayers,
  useRegistrations,
  useTies,
  useTournaments,
  useUser,
} from "@/lib/store";

// The chosen city and recent visits live in this browser; read them after hydration.
const cityListeners = new Set<() => void>();
const subscribeCity = (fn: () => void) => {
  cityListeners.add(fn);
  return () => void cityListeners.delete(fn);
};
function useCity(): [string, (c: string) => void] {
  const city = useSyncExternalStore(subscribeCity, readCity, () => "");
  return [
    city,
    (c: string) => {
      saveCity(c);
      cityListeners.forEach((fn) => fn());
    },
  ];
}
let recentCache: { key: string; ids: string[] } = { key: "", ids: [] };
function recentIds(): string[] {
  const list = readRecent();
  const key = list.map((r) => r.id).join(",");
  if (key !== recentCache.key) recentCache = { key, ids: list.map((r) => r.id) };
  return recentCache.ids;
}
const NO_IDS: string[] = [];
const noop = () => () => {};

const STATUS_TEXT: Record<EventStatus, string> = { live: "On now", upcoming: "Upcoming", finished: "Finished" };

function EventCard({ item, tournaments, data }: { item: EventItem; tournaments: Record<string, Tournament>; data: Data }) {
  const status = eventStatus(item, tournaments);
  if (item.kind === "meet") {
    const m = item.meet;
    const sports = [...new Set(m.events.map((e) => SPORTS[e.sport].name))].join(", ");
    return (
      <Link href={`/meets/${m.id}`} className="block rounded-2xl border border-border bg-surface p-4">
        <p className="flex justify-between gap-2 text-xs text-muted">
          <span className="truncate">🏅 Sports meet · {sports}</span>
          <span className={status === "live" ? "font-semibold text-live" : ""}>{STATUS_TEXT[status]}</span>
        </p>
        <p className="mt-0.5 font-semibold">{m.name}</p>
        <p className="text-sm text-muted">
          {[m.startDate, [m.venue, m.city].filter(Boolean).join(", "), `${m.events.length} event${m.events.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
        </p>
      </Link>
    );
  }
  const t = item.t;
  const winner = champion(t, data);
  return (
    <Link href={`/tournaments/${t.id}`} className="block rounded-2xl border border-border bg-surface p-4">
      <p className="flex justify-between gap-2 text-xs text-muted">
        <span className="truncate">
          🏆 {SPORTS[t.sport].name} · {FORMAT_LABELS[t.format]} · {t.entries.length} entries
        </span>
        <span className={status === "live" ? "font-semibold text-live" : ""}>{STATUS_TEXT[status]}</span>
      </p>
      <p className="mt-0.5 font-semibold">{t.name}</p>
      <p className="text-sm text-muted">
        {winner ? (
          <span className="font-semibold text-accent">🏆 {t.entries.find((e) => e.id === winner)?.name}</span>
        ) : (
          [t.startDate, [t.venue, t.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || " "
        )}
      </p>
    </Link>
  );
}

function TieCard({ tie, data }: { tie: Tie; data: Data }) {
  const state = tieState(tie, data.matches);
  return (
    <li>
      <Link href={`/ties/${tie.id}`} className="block rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs text-muted">
          {SPORTS[tie.sport].name} · Team tie · best of {tie.matchCount}
          {state.live && <span className="ml-2 font-semibold text-live">● Live</span>}
        </p>
        {(["A", "B"] as const).map((side) => (
          <p key={side} className={`flex justify-between ${state.winner === side ? "font-bold" : "font-medium"}`}>
            <span className="truncate">{tie.teams[side].name}</span>
            <span className="tabular">{state.score[side]}</span>
          </p>
        ))}
      </Link>
    </li>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function CityPicker({ city, setCity, cities }: { city: string; setCity: (c: string) => void; cities: string[] }) {
  const [editing, setEditing] = useState(!city);
  const [value, setValue] = useState(city);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-side-a">
        📍 {city} · change
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setCity(value);
        setEditing(false);
      }}
    >
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Your city, e.g. Patna" aria-label="Your city" list="known-cities" />
      <datalist id="known-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <button type="submit" className="shrink-0 rounded-lg bg-foreground px-4 text-sm font-semibold text-background">
        Save
      </button>
    </form>
  );
}

export function MatchList() {
  const matches = useMatches();
  const tournaments = useTournaments();
  const ties = useTies();
  const meets = useMeets();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const regs = useRegistrations();
  const user = useUser();
  const [city, setCity] = useCity();
  const recent = useSyncExternalStore(noop, recentIds, () => NO_IDS);
  if (matches === null || tournaments === null || ties === null || meets === null) return <p className="py-10 text-center text-muted">Loading…</p>;
  const data = { matches, ties };

  const myCardIds = cards ? myCards(Object.values(cards), contacts, user).map((c) => c.id) : [];
  const mine = yourEvents(user, meets, tournaments, regs, myCardIds, recent);
  const near = nearYou(city, meets, tournaments).filter((i) => !mine.some((m) => m.id === i.id));
  const live = Object.values(matches).filter((m) => m.status === "live");
  // Matches inside ties and tournaments are reached through them; the lists below are the single matches.
  const singles = Object.values(matches).filter((m) => !m.tie && !m.tournament);
  const upcoming = singles
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => scheduleKey(a.schedule).localeCompare(scheduleKey(b.schedule)) || b.createdAt.localeCompare(a.createdAt));
  const results = singles.filter((m) => m.status === "closed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tieList = Object.values(ties)
    .filter((x) => !x.tournament)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const nothing = Object.keys(matches).length === 0 && Object.keys(tournaments).length === 0 && Object.keys(meets).length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["/matches/new", "🏸", "Match"],
          ["/tournaments/new", "🏆", "Tournament"],
          ["/meets/new", "🏅", "Sports meet"],
        ].map(([href, icon, label]) => (
          <Link key={href} href={href} className="rounded-2xl border border-border bg-surface px-2 py-3 text-center">
            <span className="block text-2xl" aria-hidden>
              {icon}
            </span>
            <span className="mt-1 block text-xs font-semibold">+ {label}</span>
          </Link>
        ))}
      </div>

      {live.length > 0 && (
        <Section title="Live now">
          <ul className="space-y-3">
            {live.map((m) => (
              <li key={m.id}>
                <ScoreCard match={m} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {mine.length > 0 && (
        <Section title="Your events">
          <ul className="space-y-3">
            {mine.map((i) => (
              <li key={i.id}>
                <EventCard item={i} tournaments={tournaments} data={data} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Near you" action={city ? <CityPicker city={city} setCity={setCity} cities={knownCities(meets, tournaments)} /> : undefined}>
        {!city ? (
          <div className="space-y-2 rounded-2xl border border-dashed border-border p-4">
            <p className="text-sm text-muted">Set your city to see tournaments and sports meets happening near you.</p>
            <CityPicker city={city} setCity={setCity} cities={knownCities(meets, tournaments)} />
          </div>
        ) : near.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted">No upcoming events in {city} yet.</p>
        ) : (
          <ul className="space-y-3">
            {near.map((i) => (
              <li key={i.id}>
                <EventCard item={i} tournaments={tournaments} data={data} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {tieList.length > 0 && (
        <Section title="Team ties">
          <ul className="space-y-3">
            {tieList.map((x) => (
              <TieCard key={x.id} tie={x} data={data} />
            ))}
          </ul>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming matches">
          <ul className="space-y-4">
            {upcoming.map((m) => (
              <UpcomingMatch key={m.id} match={m} canScore={hasScoringAccess(m, user)} />
            ))}
          </ul>
        </Section>
      )}

      {results.length > 0 && (
        <Section title="Results">
          <ul className="space-y-3">
            {results.slice(0, 20).map((m) => (
              <li key={m.id}>
                <ScoreCard match={m} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {nothing && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No matches yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a match, tournament or sports meet with the buttons above, or load samples to explore
            {user || isRemote ? "" : " (you'll be signed in as @organiser)"}.
          </p>
          {isRemote && !user ? (
            <p className="mt-3 text-sm font-medium">Sign in (top right) to create matches or load the samples.</p>
          ) : (
            <button
              type="button"
              onClick={() => {
                const organiser = user ?? "@organiser";
                if (!user) setUser(organiser);
                demoMatches(organiser).forEach(saveMatch);
              }}
              className="mt-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium"
            >
              Load sample matches
            </button>
          )}
        </div>
      )}

      {!isRemote && (
        <p className="text-xs text-muted">
          Prototype: matches are saved in this browser only. Open a match in two tabs to see live updates between the scorer and public view.
        </p>
      )}
    </div>
  );
}

function UpcomingMatch({ match, canScore }: { match: Match; canScore: boolean }) {
  return (
    <li className="space-y-2">
      <ScoreCard match={match} />
      {canScore && (
        <Link href={`/matches/${match.id}/score`} className="block rounded-lg border border-border bg-surface py-2 text-center text-sm font-medium">
          Open scorer to start
        </Link>
      )}
    </li>
  );
}
