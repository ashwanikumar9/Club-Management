"use client";

import Link from "next/link";
import { initials } from "@/lib/players/cards";
import { SPORT_ICON, SPORTS } from "@/lib/rally/sports";
import type { Team } from "@/lib/teams/teams";

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
