import type { MatchFormat, SportKey } from "../rally/types";

/** One competition inside a sports meet, e.g. "Badminton · Men's singles". Each is played as its own tournament. */
export interface MeetEvent {
  id: string;
  sport: SportKey;
  format: MatchFormat;
  name: string;
  tournamentId: string;
  /** People who run this event like the organiser (approve its registrations, manage its tournament). */
  admins: string[];
  /** Organiser's form for this event (player details, fees); falls back to the meet's form. */
  formUrl?: string;
}

/** A multi-sport event: several sports / events under one name, with team registration by link. */
export interface Meet {
  id: string;
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  organiser: string;
  events: MeetEvent[];
  registration: {
    open: boolean;
    /** Google Form (or any link) teams fill in before sending their request. */
    formUrl?: string;
    /** Fees, deadline, rules: shown to teams on the registration page. */
    info?: string;
  };
  /** Kept empty: write access to the meet itself is the organiser's (database rules read this field). */
  scorers: string[];
  createdAt: string;
  version: number;
}

export type RegistrationStatus = "pending" | "approved" | "rejected";

/** A team's request to enter one event of a meet. Visible only to its captain and the event's managers. */
export interface Registration {
  id: string;
  meetId: string;
  eventId: string;
  /** Identity (mobile / email) of the person who sent it. */
  captain: string;
  teamName: string;
  players: { name: string; cardId?: string }[];
  /** Phone or email the organiser can reach the team on, if different from the captain's sign-in. */
  contact?: string;
  note?: string;
  /** The captain confirmed filling in the organiser's form. */
  formDone: boolean;
  status: RegistrationStatus;
  reason?: string;
  decidedBy?: string;
  decidedAt?: string;
  /** Tournament entry created on approval. */
  entryId?: string;
  createdAt: string;
  version: number;
}
