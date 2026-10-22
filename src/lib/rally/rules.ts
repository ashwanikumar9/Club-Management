import type { RallyRules } from "./types";

export function validateRules(rules: RallyRules): string | null {
  const values = [rules.pointsPerSet, rules.bestOf, rules.winBy, rules.decidingSetPoints];
  if (values.some((v) => !Number.isInteger(v) || v < 1)) return "All values must be whole numbers of at least 1.";
  if (rules.bestOf % 2 === 0) return "'Best of' must be an odd number.";
  for (const every of [rules.switchEvery, rules.decidingSwitchEvery]) {
    if (every != null && (!Number.isInteger(every) || every < 1)) return "Changing ends every N points needs a whole number of at least 1.";
  }
  if (rules.cap !== null) {
    if (!Number.isInteger(rules.cap)) return "The point cap must be a whole number.";
    if (rules.cap < Math.max(rules.pointsPerSet, rules.decidingSetPoints)) {
      return "The point cap cannot be lower than the points needed to win.";
    }
  }
  return null;
}

export function describeRules(rules: RallyRules, setLabel: string): string {
  const parts = [`${setLabel}s to ${rules.pointsPerSet}`];
  if (rules.decidingSetPoints !== rules.pointsPerSet) parts.push(`deciding ${setLabel.toLowerCase()} to ${rules.decidingSetPoints}`);
  parts.push(rules.winBy > 1 ? `win by ${rules.winBy}` : "no lead needed");
  if (rules.cap !== null) parts.push(`cap ${rules.cap}`);
  parts.push(`best of ${rules.bestOf}`);
  if (rules.switchEvery) {
    const deciding = rules.decidingSwitchEvery ?? rules.switchEvery;
    parts.push(`change ends every ${rules.switchEvery}${deciding !== rules.switchEvery ? ` (${deciding} in the deciding ${setLabel.toLowerCase()})` : ""}`);
  }
  return parts.join(" · ");
}
