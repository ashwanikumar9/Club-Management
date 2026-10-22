import type { Tournament } from "./types";

/** The organiser, or an admin they appointed (e.g. a sports meet's admin for this sport). */
export function canManageTournament(t: Pick<Tournament, "organiser" | "admins">, user: string | null): boolean {
  return !!user && (t.organiser === user || (t.admins ?? []).includes(user));
}
