"use client";

import Link from "next/link";
import { initials, type PlayerCard } from "@/lib/players/cards";
import type { PlayerStats } from "@/lib/players/stats";
import { SPORTS } from "@/lib/rally/sports";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" } as const;

/** A player's card: who they are, their sports and their record. Used on profiles and in the directory. */
export function PlayerCardView({ card, stats, href, mine = false }: { card: PlayerCard; stats: PlayerStats; href?: string; mine?: boolean }) {
  const titles = stats.medals.filter((m) => m.place === 1).length;
  const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : null;
  const body = (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent/15 text-xl font-bold text-accent">{initials(card.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold leading-tight">
            {card.name}
            {mine && <span className="ml-2 align-middle text-xs font-semibold text-accent">You</span>}
          </p>
          <p className="truncate text-sm text-muted">
            {[card.club, card.hand && `${card.hand === "right" ? "Right" : "Left"}-handed`].filter(Boolean).join(" · ") || "Player"}
          </p>
        </div>
        {stats.medals.length > 0 && (
          <span className="shrink-0 text-lg" aria-label={`${stats.medals.length} medals`}>
            {stats.medals
              .slice(0, 3)
              .map((m) => MEDAL[m.place])
              .join("")}
          </span>
        )}
      </div>
      {card.sports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {card.sports.map((s) => (
            <span key={s} className="rounded-full border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
              {SPORTS[s].name}
            </span>
          ))}
        </div>
      )}
      <dl className="tabular grid grid-cols-4 divide-x divide-border border-y border-border text-center">
        {[
          ["Played", stats.played],
          ["Won", stats.won],
          ["Win %", rate === null ? "–" : `${rate}%`],
          ["Titles", titles],
        ].map(([label, value]) => (
          <div key={label} className="py-2.5">
            <dd className="text-xl font-bold">{value}</dd>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted">
        <span className="mr-1">Form</span>
        {stats.form.length === 0 && <span>No results yet</span>}
        {stats.form.map((r, i) => (
          <span key={i} className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white ${r === "W" ? "bg-accent" : "bg-danger"}`}>
            {r}
          </span>
        ))}
        {stats.live.length > 0 && <span className="ml-auto font-semibold text-live">● Playing now</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
