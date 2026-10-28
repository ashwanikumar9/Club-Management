import { ageOf, profileSummary, type PlayerCard } from "../players/cards";
import { playerStats, type Appearance } from "../players/stats";
import { matchState } from "../rally/engine";
import { FORMAT_LABELS, SPORTS } from "../rally/sports";
import { canManageMeet, managedEvents } from "../meet/meet";
import type { Meet, Registration } from "../meet/types";
import { fixtureOutcome, isByeFixture, podium, type Data } from "../tournament/engine";
import type { Tournament } from "../tournament/types";

/**
 * Report emails, built from the same data the app shows: a player's performance report (optionally for one
 * month) and an organiser's report on a tournament or sports meet. Pure functions; the server sends them.
 */
export interface Email {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (won: number, played: number) => (played ? `${Math.round((won / played) * 100)}%` : "–");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const PLACE = { 1: "🥇 Champion", 2: "🥈 Runner-up", 3: "🥉 Third" } as const;

/** Small HTML building blocks with inline styles (email clients ignore stylesheets). */
const h = {
  title: (t: string, sub: string) =>
    `<div style="background:linear-gradient(135deg,#0f766e,#0369a1);color:#fff;padding:20px;border-radius:14px"><div style="font-size:22px;font-weight:700">${esc(t)}</div><div style="opacity:.9;margin-top:4px">${esc(sub)}</div></div>`,
  section: (t: string, body: string) => `<h2 style="font-size:15px;margin:22px 0 8px;color:#0f766e;text-transform:uppercase;letter-spacing:.04em">${esc(t)}</h2>${body}`,
  tiles: (items: [string, string | number][]) =>
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:12px"><tr>${items
      .map(([l, v]) => `<td style="text-align:center;padding:10px;border:1px solid #e5e7eb"><div style="font-size:22px;font-weight:700">${esc(String(v))}</div><div style="font-size:11px;color:#6b7280;text-transform:uppercase">${esc(l)}</div></td>`)
      .join("")}</tr></table>`,
  table: (head: string[], rows: string[][]) =>
    `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px"><tr>${head
      .map((c) => `<th style="text-align:left;padding:6px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600">${esc(c)}</th>`)
      .join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border-bottom:1px solid #f1f5f9">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`,
  list: (items: string[]) => `<ul style="padding-left:18px;margin:0">${items.map((i) => `<li style="margin:3px 0">${esc(i)}</li>`).join("")}</ul>`,
  p: (t: string) => `<p style="margin:6px 0;color:#374151">${esc(t)}</p>`,
  button: (label: string, url: string) =>
    `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">${esc(label)}</a></p>`,
};

function wrap(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827"><div style="max-width:600px;margin:0 auto;padding:16px"><div style="background:#fff;border-radius:16px;padding:16px">${body}</div><p style="font-size:12px;color:#6b7280;text-align:center;margin:14px 0">${esc(footer)}</p></div></body></html>`;
}

/** "21–15, 18–21, 21–19" from the player's side. */
function scoreLine(a: Appearance): string {
  const other = a.side === "A" ? "B" : "A";
  return matchState(a.match)
    .sets.map((s) => `${s[a.side]}–${s[other]}`)
    .join(", ");
}

function opponent(a: Appearance): string {
  return a.match.sides[a.side === "A" ? "B" : "A"].name;
}

/** A player's performance. With `month`, the period block covers that month (e.g. for the monthly email). */
export function playerReport(card: PlayerCard, data: Data, tournaments: Tournament[], baseUrl: string, month?: { start: Date; end: Date; label: string }): Email {
  const stats = playerStats(card.id, data, tournaments);
  const titles = stats.medals.filter((m) => m.place === 1).length;
  const age = ageOf(card);
  const who = [age !== null ? `Age ${age}` : "", card.club ?? ""].filter(Boolean).join(" · ") || "Player card";
  const inMonth = month ? stats.results.filter((r) => r.result && new Date(r.at) >= month.start && new Date(r.at) < month.end) : [];
  const monthWon = inMonth.filter((r) => r.result === "won").length;
  const link = `${baseUrl}/players/${card.id}`;

  let body = h.title(card.name, who);
  if (card.sports.length) body += h.section("Sports", h.list(card.sports.map((s) => `${SPORTS[s].name}${profileSummary(card, s) ? `: ${profileSummary(card, s)}` : ""}`)));
  if (month) {
    body += h.section(
      month.label,
      inMonth.length
        ? h.tiles([
            ["Played", inMonth.length],
            ["Won", monthWon],
            ["Lost", inMonth.length - monthWon],
            ["Win %", pct(monthWon, inMonth.length)],
          ])
        : h.p(`No finished matches in ${month.label}.`),
    );
  }
  body += h.section(
    "All time",
    h.tiles([
      ["Played", stats.played],
      ["Won", stats.won],
      ["Win %", pct(stats.won, stats.played)],
      ["Titles", titles],
    ]) + (stats.form.length ? h.p(`Form (latest first): ${stats.form.join(" ")}`) : ""),
  );
  if (stats.bySport.length)
    body += h.section(
      "By sport",
      h.table(
        ["Sport", "P", "W–L", "Win %", "Games", "Points"],
        stats.bySport.map((s) => [SPORTS[s.sport].name, String(s.played), `${s.won}–${s.lost}`, pct(s.won, s.played), `${s.gamesWon}–${s.gamesLost}`, `${s.pointsWon}–${s.pointsLost}`]),
      ),
    );
  if (stats.medals.length) body += h.section("Medals", h.list(stats.medals.map((m) => `${PLACE[m.place]} · ${m.tournament.name}`)));
  if (stats.topShots.length) body += h.section("Winning shots", h.p(stats.topShots.map((s) => `${s.label} ×${s.count}`).join(" · ")));
  const recent = (month ? inMonth : stats.results).slice(0, 10);
  if (recent.length)
    body += h.section(
      month ? `Results in ${month.label}` : "Recent results",
      h.table(
        ["Date", "Sport", "Against", "Result", "Score"],
        recent.map((r) => [day(r.at), SPORTS[r.match.sport].name, opponent(r), r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "–", scoreLine(r)]),
      ),
    );
  if (stats.upcoming.length)
    body += h.section(
      "Coming up",
      h.list(stats.upcoming.slice(0, 5).map((u) => [`vs ${opponent(u)}`, SPORTS[u.match.sport].name, u.match.title, u.match.schedule?.date, u.match.schedule?.time].filter(Boolean).join(" · "))),
    );
  if (stats.teams.length) body += h.section("Teams and pairs", h.p(stats.teams.join(", ")));
  body += h.button("Open the player card", link);

  const subject = month ? `${card.name}: your ${month.label} summary` : `${card.name}: performance report`;
  const text = [
    subject,
    who,
    month ? `${month.label}: played ${inMonth.length}, won ${monthWon}` : "",
    `All time: played ${stats.played}, won ${stats.won} (${pct(stats.won, stats.played)}), titles ${titles}`,
    ...stats.bySport.map((s) => `${SPORTS[s.sport].name}: ${s.won}–${s.lost}, games ${s.gamesWon}–${s.gamesLost}`),
    ...recent.map((r) => `${day(r.at)} vs ${opponent(r)}: ${r.result ?? "–"} ${scoreLine(r)}`),
    link,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html: wrap(body, "Rally Scorer · Your record comes from scored matches and can't be edited."), text };
}

interface TournamentSummary {
  played: number;
  total: number;
  podium: string[];
  results: string[][];
  upcoming: string[];
}

function summarise(t: Tournament, data: Data): TournamentSummary {
  const name = (id?: string) => t.entries.find((e) => e.id === id)?.name ?? "TBD";
  const fixtures = t.fixtures.filter((f) => !isByeFixture(f));
  const results: string[][] = [];
  const upcoming: string[] = [];
  let played = 0;
  for (const f of fixtures) {
    const o = fixtureOutcome(f, data);
    if (o.status === "closed" && o.winner) {
      played += 1;
      const w = o.winner === "A" ? o.entries.A : o.entries.B;
      const l = o.winner === "A" ? o.entries.B : o.entries.A;
      results.push([name(w), name(l), `${o.score[o.winner]}–${o.score[o.winner === "A" ? "B" : "A"]}${o.kind ? ` (${o.kind})` : ""}`]);
    } else if (o.status !== "closed" && o.entries.A && o.entries.B) {
      upcoming.push([`${name(o.entries.A)} vs ${name(o.entries.B)}`, f.schedule?.date, f.schedule?.time, f.schedule?.court].filter(Boolean).join(" · "));
    }
  }
  const top = podium(t, data);
  const podiumLines = [top.first && `${PLACE[1]}: ${name(top.first)}`, top.second && t.phase === "complete" && `${PLACE[2]}: ${name(top.second)}`, top.third && `${PLACE[3]}: ${name(top.third)}`].filter(
    Boolean,
  ) as string[];
  return { played, total: fixtures.length, podium: podiumLines, results: results.reverse(), upcoming };
}

const PHASE: Record<Tournament["phase"], string> = { setup: "Taking entries", groups: "Group stage", knockout: "Knockout", complete: "Finished" };

/** For the organiser / admins: where the tournament stands. */
export function tournamentReport(t: Tournament, data: Data, baseUrl: string): Email {
  const s = summarise(t, data);
  let body = h.title(t.name, [`${SPORTS[t.sport].name} ${FORMAT_LABELS[t.format]}`, t.venue, t.startDate].filter(Boolean).join(" · "));
  body += h.tiles([
    ["Entries", t.entries.length],
    ["Played", s.played],
    ["Still to play", Math.max(0, s.total - s.played)],
    ["Stage", PHASE[t.phase]],
  ]);
  if (s.podium.length) body += h.section("Podium", h.list(s.podium));
  if (s.results.length) body += h.section("Results (latest first)", h.table(["Winner", "Beat", "Score"], s.results.slice(0, 25)));
  if (s.upcoming.length) body += h.section("Coming up", h.list(s.upcoming.slice(0, 15)));
  body += h.section("Entries", h.p(t.entries.map((e) => e.name).join(", ") || "None yet"));
  body += h.button("Open the tournament", `${baseUrl}/tournaments/${t.id}`);
  const subject = `${t.name}: tournament report`;
  const text = [subject, `Entries ${t.entries.length}, played ${s.played} of ${s.total}, ${PHASE[t.phase]}`, ...s.podium, ...s.results.slice(0, 25).map((r) => `${r[0]} beat ${r[1]} ${r[2]}`), `${baseUrl}/tournaments/${t.id}`].join("\n");
  return { subject, html: wrap(body, "Rally Scorer · Organiser report"), text };
}

/** For the organiser (all events) or an event admin (their events): entries, registrations and results. */
export function meetReport(meet: Meet, tournaments: Record<string, Tournament>, data: Data, regs: Registration[], user: string, baseUrl: string): Email {
  const events = canManageMeet(meet, user) ? meet.events : managedEvents(meet, user);
  let body = h.title(meet.name, [[meet.venue, meet.city].filter(Boolean).join(", "), meet.startDate].filter(Boolean).join(" · "));
  const lines: string[] = [];
  for (const e of events) {
    const t = tournaments[e.tournamentId];
    const mine = regs.filter((r) => r.eventId === e.id);
    const count = (st: Registration["status"]) => mine.filter((r) => r.status === st).length;
    const s = t ? summarise(t, data) : null;
    body += h.section(
      e.name,
      h.tiles([
        ["Entries", t?.entries.length ?? 0],
        ["Waiting", count("pending")],
        ["Approved", count("approved")],
        ["Played", s ? `${s.played}/${s.total}` : "–"],
      ]) +
        (s?.podium.length ? h.list(s.podium) : "") +
        (s?.results.length ? h.table(["Winner", "Beat", "Score"], s.results.slice(0, 8)) : ""),
    );
    lines.push(`${e.name}: ${t?.entries.length ?? 0} entries, ${count("pending")} waiting, ${s ? `${s.played}/${s.total} played` : ""} ${s?.podium.join(", ") ?? ""}`);
  }
  if (events.length === 0) body += h.p("You don't run any event of this meet.");
  body += h.button("Open the sports meet", `${baseUrl}/meets/${meet.id}`);
  const subject = `${meet.name}: sports meet report`;
  return { subject, html: wrap(body, "Rally Scorer · Organiser report"), text: [subject, ...lines, `${baseUrl}/meets/${meet.id}`].join("\n") };
}

/** The calendar month before `now` (the monthly email runs on the 1st). */
export function previousMonth(now = new Date()): { start: Date; end: Date; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end, label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
}
