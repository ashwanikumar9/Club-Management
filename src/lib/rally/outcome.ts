import type { Match, MatchOutcome } from "./types";

export function describeOutcome(match: Match, outcome: MatchOutcome): string {
  if (outcome.type === "no_result") return "No result";
  const winner = match.sides[outcome.winner!].name;
  const loser = match.sides[outcome.winner === "A" ? "B" : "A"].name;
  return outcome.type === "retired" ? `${loser} retired, ${winner} wins` : `Walkover, ${winner} wins (${loser} did not play)`;
}
