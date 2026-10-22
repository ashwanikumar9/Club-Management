import type { ActionDef, MatchFormat, RallyRules, SportKey } from "./types";

export interface SportConfig {
  key: SportKey;
  name: string;
  /** Word used for a set in this sport. */
  setLabel: string;
  formats: MatchFormat[];
  rules: RallyRules;
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
