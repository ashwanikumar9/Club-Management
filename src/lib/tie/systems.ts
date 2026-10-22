import type { SideKey } from "../rally/types";
import type { Tie } from "./types";

/** One match of a team system. `letters` names the singles players by the letters the captains assign. */
export interface SystemSlot {
  format: "singles" | "doubles";
  label: string;
  letters?: Record<SideKey, string>;
}

/** An official team-match format: the matches in order, and the letters each team assigns to its players. */
export interface TieSystem {
  key: string;
  sport: "badminton" | "table_tennis";
  label: string;
  hint: string;
  slots: SystemSlot[];
  /** Letters team A and team B give to their singles players (ITTF systems). */
  letters?: Record<SideKey, string[]>;
  /** Most individual matches one player may play in the tie. */
  maxPerPlayer?: number;
}

const s = (a: string, b: string): SystemSlot => ({ format: "singles", label: `${a} v ${b}`, letters: { A: a, B: b } });
const d = (label = "Doubles"): SystemSlot => ({ format: "doubles", label });

/**
 * Sources: BWF Thomas & Uber Cup and Sudirman Cup regulations; ITTF Regulations 3.7.6 (team match systems)
 * and 3.7.7 (team match procedure).
 */
export const TIE_SYSTEMS: TieSystem[] = [
  {
    key: "thomas_uber",
    sport: "badminton",
    label: "Thomas / Uber Cup",
    hint: "3 singles + 2 doubles: S1, D1, S2, D2, S3",
    slots: [
      { format: "singles", label: "1st singles" },
      { format: "doubles", label: "1st doubles" },
      { format: "singles", label: "2nd singles" },
      { format: "doubles", label: "2nd doubles" },
      { format: "singles", label: "3rd singles" },
    ],
  },
  {
    key: "sudirman",
    sport: "badminton",
    label: "Sudirman Cup (mixed teams)",
    hint: "Men's & women's singles, men's, women's & mixed doubles",
    slots: [
      { format: "doubles", label: "Mixed doubles" },
      { format: "singles", label: "Women's singles" },
      { format: "singles", label: "Men's singles" },
      { format: "doubles", label: "Women's doubles" },
      { format: "doubles", label: "Men's doubles" },
    ],
  },
  {
    key: "swaythling",
    sport: "table_tennis",
    label: "Swaythling (best of 5)",
    hint: "3 players, 5 singles: A–X, B–Y, C–Z, A–Y, B–X",
    letters: { A: ["A", "B", "C"], B: ["X", "Y", "Z"] },
    slots: [s("A", "X"), s("B", "Y"), s("C", "Z"), s("A", "Y"), s("B", "X")],
  },
  {
    key: "corbillon",
    sport: "table_tennis",
    label: "Corbillon (best of 5)",
    hint: "2–4 players: A–X, B–Y, doubles, A–Y, B–X",
    letters: { A: ["A", "B"], B: ["X", "Y"] },
    slots: [s("A", "X"), s("B", "Y"), d(), s("A", "Y"), s("B", "X")],
  },
  {
    key: "olympic",
    sport: "table_tennis",
    label: "Olympic (best of 5)",
    hint: "3 players: A–X, B–Y, doubles, then A or B v Z and C v X or Y. Max 2 matches each",
    letters: { A: ["A", "B", "C"], B: ["X", "Y", "Z"] },
    maxPerPlayer: 2,
    slots: [
      s("A", "X"),
      s("B", "Y"),
      d("Doubles (C + A/B v Z + X/Y)"),
      { format: "singles", label: "A or B v Z" },
      { format: "singles", label: "C v X or Y" },
    ],
  },
  {
    key: "best_of_7",
    sport: "table_tennis",
    label: "Best of 7 (6 singles + doubles)",
    hint: "3–5 players: A–X, B–Y, C–Z, doubles, A–Y, C–X, B–Z",
    letters: { A: ["A", "B", "C"], B: ["X", "Y", "Z"] },
    slots: [s("A", "X"), s("B", "Y"), s("C", "Z"), d(), s("A", "Y"), s("C", "X"), s("B", "Z")],
  },
  {
    key: "best_of_9",
    sport: "table_tennis",
    label: "Best of 9 (old Swaythling)",
    hint: "3 players, 9 singles: everyone plays everyone",
    letters: { A: ["A", "B", "C"], B: ["X", "Y", "Z"] },
    slots: [s("A", "X"), s("B", "Y"), s("C", "Z"), s("B", "X"), s("A", "Z"), s("C", "Y"), s("B", "Z"), s("C", "X"), s("A", "Y")],
  },
];

export function tieSystem(key: string | undefined): TieSystem | undefined {
  return key ? TIE_SYSTEMS.find((x) => x.key === key) : undefined;
}

export function systemsFor(sport: string): TieSystem[] {
  return TIE_SYSTEMS.filter((x) => x.sport === sport);
}

/** Matches each player is lined up for (or has played) in the tie. */
export function matchesPerPlayer(tie: Tie): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of tie.slots) {
    for (const side of ["A", "B"] as const) for (const id of slot.players?.[side] ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
