"use client";

import Link from "next/link";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { initials, myCards } from "@/lib/players/cards";
import { SPORT_ICON, SPORTS } from "@/lib/rally/sports";
import type { SportKey } from "@/lib/rally/types";
import { saveTeam, usePlayerContacts, usePlayers, useTeams, useUser } from "@/lib/store";
import { createTeam, myTeams, searchTeams, type Team } from "@/lib/teams/teams";

/** Team as a card: sport colour, name, city and squad size. */
export function TeamCard({ team, href = `/teams/${team.id}`, onClick, note }: { team: Team; href?: string | null; onClick?: () => void; note?: string }) {
  const body = (
    <>
      <span className={`sport-${team.sport} sport-tile grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-bold`} aria-hidden>
        {initials(team.name) || SPORT_ICON[team.sport]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{team.name}</span>
        <span className="block truncate text-xs text-muted">
          {[`${SPORT_ICON[team.sport]} ${SPORTS[team.sport].name}`, team.city, `${team.players.length} player${team.players.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
        </span>
        {note && <span className="block text-xs font-medium text-accent">{note}</span>}
      </span>
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left";
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * "Pick a saved team" button and sheet: the teams this person runs or plays in for the sport first, a search
 * over all of the sport's teams, and a quick "new team" form (the squad is filled in by the form that uses it).
 */
export function TeamPicker({ sport, onPick, label = "Pick a saved team" }: { sport: SportKey; onPick: (team: Team) => void; label?: string }) {
  const user = useUser();
  const teams = useTeams();
  const cards = usePlayers();
  const contacts = usePlayerContacts();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const all = teams ? Object.values(teams).filter((t) => t.sport === sport) : [];
  const mine = myTeams(all, user, cards ? myCards(Object.values(cards), contacts, user).map((c) => c.id) : []);
  const found = query.trim() ? searchTeams(all, query, sport).filter((t) => !mine.includes(t)) : [];
  const pick = (t: Team) => {
    onPick(t);
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl border border-dashed border-border py-2 text-sm font-medium text-side-a">
        {SPORT_ICON[sport]} {label}
      </button>
      {open && (
        <Sheet title={`${SPORTS[sport].name} teams`} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {mine.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your teams</p>
                {mine.map((t) => (
                  <TeamCard key={t.id} team={t} onClick={() => pick(t)} />
                ))}
              </div>
            )}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams by name or city" aria-label="Search teams" />
            {found.map((t) => (
              <TeamCard key={t.id} team={t} onClick={() => pick(t)} />
            ))}
            {query.trim() && found.length === 0 && <p className="text-sm text-muted">No other team matches.</p>}
            {user && (
              <div className="space-y-2 rounded-2xl border border-border p-3">
                <p className="text-sm font-semibold">New team</p>
                <div className="flex gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" aria-label="New team name" />
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="New team city" />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const team = createTeam({ name, sport, city, by: user }, all);
                      void saveTeam(team);
                      pick(team);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="btn-grad w-full rounded-xl py-2 font-semibold"
                >
                  Create and use
                </button>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}
