import type { PlayerCard } from "@/lib/players/cards";
import { playerStats } from "@/lib/players/stats";
import type { Match } from "@/lib/rally/types";
import { playerReport, previousMonth } from "@/lib/reports/report";
import { db, json, loadDocs, missingSetup, secret, sendEmail } from "@/lib/reports/server";
import type { Tie } from "@/lib/tie/types";
import type { Tournament } from "@/lib/tournament/types";

/**
 * Monthly summary, run by Vercel on the 1st (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
 * Everyone with a confirmed report email and monthly on gets one email per player card that has any matches.
 */
export async function GET(request: Request) {
  const setup = missingSetup();
  if (setup) return json({ error: setup }, 503);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed." }, 401);

  const client = db();
  const { data: recipients, error } = await client.rpc("report_recipients", { secret });
  if (error) return json({ error: error.message }, 500);
  const [matches, ties, tournaments, cards] = await Promise.all([
    loadDocs<Match>(client, "matches"),
    loadDocs<Tie>(client, "ties"),
    loadDocs<Tournament>(client, "tournaments"),
    loadDocs<PlayerCard>(client, "players"),
  ]);
  const data = { matches: Object.fromEntries(matches.map((m) => [m.id, m])), ties: Object.fromEntries(ties.map((t) => [t.id, t])) };
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const month = previousMonth();
  const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(request.url).origin;

  let sent = 0;
  const failed: string[] = [];
  for (const r of (recipients ?? []) as { identity: string; email: string; card_ids: string[] }[]) {
    for (const id of r.card_ids) {
      const card = byId[id];
      if (!card) continue;
      const stats = playerStats(id, data, tournaments);
      if (stats.results.length + stats.upcoming.length + stats.live.length === 0) continue;
      try {
        await sendEmail(r.email, playerReport(card, data, tournaments, base, month));
        sent += 1;
      } catch (e) {
        failed.push(`${r.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return json({ month: month.label, sent, failed });
}
