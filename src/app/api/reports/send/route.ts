import { canManageMeet, managedEvents } from "@/lib/meet/meet";
import type { Meet, Registration } from "@/lib/meet/types";
import type { PlayerCard } from "@/lib/players/cards";
import type { Match } from "@/lib/rally/types";
import { meetReport, playerReport, tournamentReport, type Email } from "@/lib/reports/report";
import { caller, db, json, loadDocs, missingSetup, secret, sendEmail } from "@/lib/reports/server";
import type { Tie } from "@/lib/tie/types";
import { canManageTournament } from "@/lib/tournament/access";
import type { Tournament } from "@/lib/tournament/types";

/** Minutes between two requested reports for one person. */
const GAP = 10;

/** Emails a report on request: a player's own card, or a tournament / sports meet the person runs. */
export async function POST(request: Request) {
  const setup = missingSetup();
  if (setup) return json({ error: setup }, 503);
  const who = await caller(request);
  if (!who) return json({ error: "Sign in first." }, 401);
  const { kind, id } = (await request.json().catch(() => ({}))) as { kind?: string; id?: string };
  if (!id || !["player", "tournament", "meet"].includes(kind ?? "")) return json({ error: "Unknown report." }, 400);

  const mine = db(who.token);
  const doc = async <T,>(collection: string) =>
    (await mine.from("documents").select("data").eq("collection", collection).eq("id", id).maybeSingle()).data?.data as T | undefined;
  const all = async () => {
    const [matches, ties, tournaments] = await Promise.all([loadDocs<Match>(mine, "matches"), loadDocs<Tie>(mine, "ties"), loadDocs<Tournament>(mine, "tournaments")]);
    return { data: { matches: Object.fromEntries(matches.map((m) => [m.id, m])), ties: Object.fromEntries(ties.map((t) => [t.id, t])) }, tournaments };
  };
  const base = new URL(request.url).origin;

  let email: Email;
  if (kind === "player") {
    const card = await doc<PlayerCard>("players");
    const { data: own } = await mine.from("player_contacts").select("player_id").eq("player_id", id).eq("contact", who.identity);
    if (!card || !own?.length) return json({ error: "You can only get the report for your own player card." }, 403);
    const { data, tournaments } = await all();
    email = playerReport(card, data, tournaments, base);
  } else if (kind === "tournament") {
    const t = await doc<Tournament>("tournaments");
    if (!t || !canManageTournament(t, who.identity)) return json({ error: "Only the tournament's organiser and admins get its report." }, 403);
    const { data } = await all();
    email = tournamentReport(t, data, base);
  } else {
    const meet = await doc<Meet>("meets");
    if (!meet || (!canManageMeet(meet, who.identity) && managedEvents(meet, who.identity).length === 0))
      return json({ error: "Only the meet's organiser and event admins get its report." }, 403);
    const { data, tournaments } = await all();
    const { data: regs } = await mine.from("registrations").select("data").eq("meet_id", id);
    email = meetReport(meet, Object.fromEntries(tournaments.map((t) => [t.id, t])), data, (regs ?? []).map((r) => r.data as Registration), who.identity, base);
  }

  const { data: address, error } = await mine.rpc("claim_report_send", { secret, who: who.identity, gap_minutes: GAP });
  if (error) return json({ error: error.message }, 500);
  if (!address) {
    const { data: row } = await mine.from("report_settings").select("email").maybeSingle();
    return json({ error: row ? `A report was sent a few minutes ago. You can ask again ${GAP} minutes after the last one.` : "Add an email for reports first (My card → Email reports)." }, 409);
  }
  try {
    await sendEmail(address as string, email);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
  return json({ sentTo: address });
}
