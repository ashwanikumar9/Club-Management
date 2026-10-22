import type { RallyRules, SportKey } from "./types";

/** A ready-made set of match rules, so organisers don't have to know the numbers. */
export interface RulePreset {
  key: string;
  label: string;
  /** When to use it, in plain words. */
  hint: string;
  rules: RallyRules;
  /** Follows the governing body's laws as written. */
  official?: boolean;
}

/**
 * Sources: Laws of Badminton (BWF), ITTF Laws 2.11–2.15, FIVB Official Volleyball Rules 2025–2028 and
 * FIVB Beach Volleyball Rules. The first preset of each sport is its default.
 */
export const RULE_PRESETS: Record<SportKey, RulePreset[]> = {
  badminton: [
    {
      key: "bwf_21",
      label: "Best of 3 games to 21",
      hint: "BWF laws: 2 clear points from 20-all, 30 wins",
      official: true,
      rules: { pointsPerSet: 21, bestOf: 3, winBy: 2, cap: 30, decidingSetPoints: 21 },
    },
    {
      key: "bwf_15",
      label: "Best of 3 games to 15",
      hint: "BWF 3×15 system (approved 2026): 2 clear points from 14-all, 21 wins",
      rules: { pointsPerSet: 15, bestOf: 3, winBy: 2, cap: 21, decidingSetPoints: 15 },
    },
    {
      key: "one_21",
      label: "One game to 21",
      hint: "Quick club or group matches",
      rules: { pointsPerSet: 21, bestOf: 1, winBy: 2, cap: 30, decidingSetPoints: 21 },
    },
    {
      key: "one_15",
      label: "One game to 15",
      hint: "Very short matches, many entries",
      rules: { pointsPerSet: 15, bestOf: 1, winBy: 2, cap: 21, decidingSetPoints: 15 },
    },
  ],
  table_tennis: [
    {
      key: "ittf_5",
      label: "Best of 5 games to 11",
      hint: "ITTF laws: 2 clear points from 10-all, no cap",
      official: true,
      rules: { pointsPerSet: 11, bestOf: 5, winBy: 2, cap: null, decidingSetPoints: 11 },
    },
    {
      key: "ittf_7",
      label: "Best of 7 games to 11",
      hint: "Major singles events and finals",
      official: true,
      rules: { pointsPerSet: 11, bestOf: 7, winBy: 2, cap: null, decidingSetPoints: 11 },
    },
    {
      key: "ittf_3",
      label: "Best of 3 games to 11",
      hint: "Group stages, team ties and club nights",
      official: true,
      rules: { pointsPerSet: 11, bestOf: 3, winBy: 2, cap: null, decidingSetPoints: 11 },
    },
  ],
  volleyball: [
    {
      key: "fivb_5",
      label: "Indoor: best of 5 sets to 25",
      hint: "FIVB rules: 5th set to 15, 2 clear points, no cap",
      official: true,
      rules: { pointsPerSet: 25, bestOf: 5, winBy: 2, cap: null, decidingSetPoints: 15 },
    },
    {
      key: "fivb_3",
      label: "Indoor: best of 3 sets to 25",
      hint: "Shorter matches; deciding set to 15",
      rules: { pointsPerSet: 25, bestOf: 3, winBy: 2, cap: null, decidingSetPoints: 15 },
    },
    {
      key: "beach",
      label: "Beach: best of 3 sets to 21",
      hint: "FIVB beach rules: 3rd set to 15, change ends every 7 points (5 in the 3rd set)",
      official: true,
      rules: { pointsPerSet: 21, bestOf: 3, winBy: 2, cap: null, decidingSetPoints: 15, switchEvery: 7, decidingSwitchEvery: 5 },
    },
  ],
};

const same = (a: RallyRules, b: RallyRules) =>
  a.pointsPerSet === b.pointsPerSet &&
  a.bestOf === b.bestOf &&
  a.winBy === b.winBy &&
  a.cap === b.cap &&
  a.decidingSetPoints === b.decidingSetPoints &&
  (a.switchEvery ?? null) === (b.switchEvery ?? null) &&
  (a.decidingSwitchEvery ?? null) === (b.decidingSwitchEvery ?? null);

/** The preset these rules match exactly, if any. */
export function matchingPreset(sport: SportKey, rules: RallyRules): RulePreset | undefined {
  return RULE_PRESETS[sport].find((p) => same(p.rules, rules));
}
