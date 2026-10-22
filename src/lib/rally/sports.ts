import type { ActionDef, MatchFormat, RallyRules, SportKey } from "./types";

/** How service passes between sides, and when players change ends. */
export interface ServeConfig {
  /** "rally_winner": whoever wins the rally serves next; "every_two": service alternates every 2 points (1 at deuce). */
  rule: "rally_winner" | "every_two";
  /** Who serves first in the next set: the winner of the previous set, or alternating each set. */
  nextSet: "set_winner" | "alternate";
  /** In the deciding set, ends change when a side first reaches half the target, rounded up or down. */
  midSwitch: "ceil" | "floor";
  /** A new toss decides service and ends of the deciding set (FIVB rule 7.1). */
  decidingToss?: boolean;
}

/** Breaks the rules allow, in seconds. Shown to the scorer as reminders. */
export interface Intervals {
  /** When the leading side reaches half the target in a set (badminton: 60 s at 11). */
  mid: number | null;
  /** Between sets / games. */
  between: number;
}

export interface SportConfig {
  key: SportKey;
  name: string;
  /** Word used for a set in this sport. */
  setLabel: string;
  formats: MatchFormat[];
  rules: RallyRules;
  serve: ServeConfig;
  intervals: Intervals;
  actions: ActionDef[];
}

function action(
  key: string,
  label: string,
  credit: ActionDef["credit"],
  templates: string[],
): ActionDef {
  return { key, label, credit, templates, enabled: true };
}

export const SPORTS: Record<SportKey, SportConfig> = {
  badminton: {
    key: "badminton",
    name: "Badminton",
    setLabel: "Game",
    formats: ["singles", "doubles", "team"],
    rules: { pointsPerSet: 21, bestOf: 3, winBy: 2, cap: 30, decidingSetPoints: 21 },
    serve: { rule: "rally_winner", nextSet: "set_winner", midSwitch: "ceil" },
    intervals: { mid: 60, between: 120 },
    actions: [
      action("smash", "Great smash", "winner", [
        "{player} wins the point with a great smash",
        "Thunderous smash from {player}!",
      ]),
      action("drop", "Delicate / perfect drop", "winner", [
        "{player} plays a delicate drop, point {side}",
        "Perfect drop shot from {player}",
      ]),
      action("net_shot", "Net shot", "winner", ["{player} wins it with a tight net shot"]),
      action("drive", "Clear / drive winner", "winner", ["{player} finds the gap with a winner"]),
      action("misjudged", "Opponent misjudged", "error", [
        "{opponent} misjudges the shuttle, point to {side}",
        "{opponent} leaves it, but it lands in! Point {side}",
      ]),
      action("into_net", "Opponent hit into the net", "error", [
        "{opponent} puts it into the net, point to {side}",
      ]),
      action("out", "Opponent hit outside the line", "error", [
        "{opponent} hits it outside the line, point to {side}",
      ]),
      action("service_fault", "Opponent service fault", "error", [
        "Service fault by {opponent}, point to {side}",
      ]),
    ],
  },
  table_tennis: {
    key: "table_tennis",
    name: "Table Tennis",
    setLabel: "Game",
    formats: ["singles", "doubles", "team"],
    rules: { pointsPerSet: 11, bestOf: 5, winBy: 2, cap: null, decidingSetPoints: 11 },
    serve: { rule: "every_two", nextSet: "alternate", midSwitch: "floor" },
    intervals: { mid: null, between: 60 },
    actions: [
      action("smash", "Smash", "winner", ["{player} smashes it away!", "Powerful smash from {player}"]),
      action("loop", "Loop / topspin winner", "winner", ["{player} wins it with a heavy topspin loop"]),
      action("push", "Push / chop winner", "winner", ["{player} wins the point with a sharp push"]),
      action("serve_ace", "Serve ace", "winner", ["Unreturnable serve from {player}"]),
      action("edge", "Edge / net ball", "winner", ["Lucky edge for {player}, point {side}"]),
      action("into_net", "Opponent hit into the net", "error", ["{opponent} finds the net, point to {side}"]),
      action("out", "Opponent hit long / wide", "error", ["{opponent} misses the table, point to {side}"]),
      action("service_fault", "Opponent service fault", "error", ["Service fault by {opponent}, point to {side}"]),
    ],
  },
  volleyball: {
    key: "volleyball",
    name: "Volleyball",
    setLabel: "Set",
    formats: ["team"],
    rules: { pointsPerSet: 25, bestOf: 5, winBy: 2, cap: null, decidingSetPoints: 15 },
    serve: { rule: "rally_winner", nextSet: "alternate", midSwitch: "ceil", decidingToss: true },
    intervals: { mid: null, between: 180 },
    actions: [
      action("kill", "Attack / spike kill", "winner", [
        "{player} hammers the spike down for {side}",
        "Kill from {player}!",
      ]),
      action("block", "Block", "winner", ["Huge block by {player}!", "{player} stuffs the attack at the net"]),
      action("ace", "Service ace", "winner", ["Ace from {player}!"]),
      action("tip", "Tip / dump", "winner", ["Clever tip from {player} finds the floor"]),
      action("attack_error", "Opponent attack error", "error", ["{opponent} hits the attack out, point {side}"]),
      action("service_error", "Opponent service error", "error", ["Service error by {opponent}, point {side}"]),
      action("net_fault", "Opponent net touch / fault", "error", ["Net fault on {opponent}, point {side}"]),
      action("rotation", "Opponent rotation fault", "error", ["Rotation fault by {opponentSide}, point {side}"]),
    ],
  },
};

export const SPORT_LIST: SportConfig[] = [SPORTS.badminton, SPORTS.table_tennis, SPORTS.volleyball];

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  singles: "Singles",
  doubles: "Doubles",
  team: "Team",
};
