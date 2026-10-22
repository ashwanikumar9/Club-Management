import { addPoint, createMatch, setLatestPointDetail, startMatch } from "./rally/mutations";
import { SPORTS } from "./rally/sports";
import type { Match, SideKey } from "./rally/types";

/** Builds a few sample matches so the prototype can be explored without typing in teams. */
export function demoMatches(): Match[] {
  const badminton = createMatch({
    sport: "badminton",
    title: "Women's Singles · Semi-final",
    venue: "Court 1",
    livestreamUrl: "",
    format: "singles",
    rules: SPORTS.badminton.rules,
    sides: {
      A: { name: "Riya Sharma", players: [{ name: "Riya Sharma" }] },
      B: { name: "Asha Verma", players: [{ name: "Asha Verma" }] },
    },
  });

  let live = startMatch(badminton);
  const rallies: [SideKey, string | null][] = [
    ["A", "smash"], ["B", "drop"], ["A", "into_net"], ["A", null], ["B", "out"],
    ["A", "misjudged"], ["B", "smash"], ["A", "net_shot"], ["A", "service_fault"], ["B", null],
  ];
  for (const [side, actionKey] of rallies) {
    const added = addPoint(live, side, "Scorer");
    live = actionKey ? setLatestPointDetail(added.match, added.event.id, { actionKey }) : added.match;
  }

  const volleyball = createMatch({
    sport: "volleyball",
    title: "Men's Team · Pool A",
    venue: "Main Ground",
    livestreamUrl: "https://www.youtube.com/",
    format: "team",
    rules: SPORTS.volleyball.rules,
    sides: {
      A: {
        name: "Eagles",
        players: [
          { name: "Kiran", jersey: "7" }, { name: "Arjun", jersey: "10" }, { name: "Vikram", jersey: "3" },
          { name: "Rohit", jersey: "12" }, { name: "Sahil", jersey: "5" }, { name: "Manav", jersey: "9" },
        ],
      },
      B: {
        name: "Hawks",
        players: [
          { name: "Dev", jersey: "4" }, { name: "Nikhil", jersey: "8" }, { name: "Aman", jersey: "11" },
          { name: "Yash", jersey: "2" }, { name: "Kabir", jersey: "6" }, { name: "Ishaan", jersey: "14" },
        ],
      },
    },
  });

  const tableTennis = createMatch({
    sport: "table_tennis",
    title: "Mixed Doubles · Final",
    venue: "Hall B, Table 2",
    livestreamUrl: "",
    format: "doubles",
    rules: SPORTS.table_tennis.rules,
    sides: {
      A: { name: "Meera / Karan", players: [{ name: "Meera" }, { name: "Karan" }] },
      B: { name: "Sana / Rahul", players: [{ name: "Sana" }, { name: "Rahul" }] },
    },
  });

  return [live, volleyball, tableTennis];
}
