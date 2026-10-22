import { RULE_PRESETS } from "../rally/presets";
import type { RallyRules, SportKey } from "../rally/types";
import { OFFICIAL_RANKING, type RankingKey } from "./ranking";
import type { PointsConfig, Structure } from "./types";

/** Everything a template decides; the organiser can still change each value. */
export interface TemplateSettings {
  structure: Structure;
  rules: RallyRules;
  ranking: RankingKey;
  points: PointsConfig;
  thirdPlace: boolean;
  /** 2 = every pair meets twice (home and away). */
  legs: 1 | 2;
  /** Team event (ties for badminton / table tennis). */
  team: boolean;
  tieSystem?: string;
}

export interface TournamentTemplate {
  key: string;
  label: string;
  /** Who it's for. */
  who: string;
  text: string;
  sports: SportKey[];
  settings: (sport: SportKey) => TemplateSettings;
}

const rules = (sport: SportKey, key?: string) => ({ ...(RULE_PRESETS[sport].find((p) => p.key === key) ?? RULE_PRESETS[sport][0]).rules });
const ALL: SportKey[] = ["badminton", "table_tennis", "volleyball"];
const SHORT: Record<SportKey, string> = { badminton: "one_21", table_tennis: "ittf_3", volleyball: "fivb_3" };
const TEAM_SYSTEM: Partial<Record<SportKey, string>> = { badminton: "thomas_uber", table_tennis: "swaythling" };

/** Ready-made tournaments for organisers who don't know the official formats. */
export const TEMPLATES: TournamentTemplate[] = [
  {
    key: "club_night",
    label: "Club night",
    who: "4–12 players, one evening",
    text: "Everyone plays everyone once with short matches. 2 points for a win.",
    sports: ALL,
    settings: (sport) => ({
      structure: "league",
      rules: rules(sport, SHORT[sport]),
      ranking: "custom",
      points: { win: 2, loss: 0 },
      thirdPlace: false,
      legs: 1,
      team: sport === "volleyball",
    }),
  },
  {
    key: "knockout",
    label: "Official knockout",
    who: "Any size, one or two days",
    text: "Seeded draw as in BWF / ITTF events: top seeds get the byes, lose once and you're out.",
    sports: ALL,
    settings: (sport) => ({
      structure: "knockout",
      rules: rules(sport),
      ranking: OFFICIAL_RANKING[sport],
      points: { win: 2, loss: 0 },
      thirdPlace: false,
      legs: 1,
      team: sport === "volleyball",
    }),
  },
  {
    key: "championship",
    label: "Championship",
    who: "12–48 entries",
    text: "Groups of 3–4 with official tables, then the top 2 of each group play a seeded knockout.",
    sports: ALL,
    settings: (sport) => ({
      structure: "groups_knockout",
      rules: rules(sport),
      ranking: OFFICIAL_RANKING[sport],
      points: { win: 2, loss: 0 },
      thirdPlace: false,
      legs: 1,
      team: sport === "volleyball",
    }),
  },
  {
    key: "team_championship",
    label: "Team championship",
    who: "Inter-club, schools, corporate",
    text: "Teams play official team ties (Thomas Cup for badminton, Swaythling for table tennis) in groups, then a knockout.",
    sports: ["badminton", "table_tennis"],
    settings: (sport) => ({
      structure: "groups_knockout",
      rules: rules(sport, sport === "table_tennis" ? "ittf_5" : undefined),
      ranking: OFFICIAL_RANKING[sport],
      points: { win: 2, loss: 0 },
      thirdPlace: false,
      legs: 1,
      team: true,
      tieSystem: TEAM_SYSTEM[sport],
    }),
  },
  {
    key: "league_season",
    label: "League season",
    who: "Over weeks or months",
    text: "Everyone plays everyone twice (home and away) with official scoring and tables.",
    sports: ALL,
    settings: (sport) => ({
      structure: "league",
      rules: rules(sport),
      ranking: OFFICIAL_RANKING[sport],
      points: { win: 2, loss: 0 },
      thirdPlace: false,
      legs: 2,
      team: sport === "volleyball",
    }),
  },
  {
    key: "beach",
    label: "Beach volleyball",
    who: "Pairs or small teams",
    text: "Best of 3 to 21 with side changes every 7 points; pools then a knockout.",
    sports: ["volleyball"],
    settings: () => ({
      structure: "groups_knockout",
      rules: rules("volleyball", "beach"),
      ranking: "fivb",
      points: { win: 2, loss: 0 },
      thirdPlace: true,
      legs: 1,
      team: true,
    }),
  },
];

/** Seeds an official draw uses for this many entries (BWF GCR 11.7). */
export function suggestedSeeds(entries: number): number {
  if (entries >= 64) return 16;
  if (entries >= 32) return 8;
  if (entries >= 16) return 4;
  return entries >= 4 ? 2 : 0;
}

/** Group count for groups of about four (BWF / ITTF championships use groups of 3–4). */
export function suggestedGroups(entries: number): number {
  return Math.max(1, Math.round(entries / 4));
}
