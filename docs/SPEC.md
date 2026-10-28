# Multi-Sport Event Scoring Platform — Version 1 Spec

> Working title: TBD (product name to be chosen later)
> Status: Agreed blueprint, pre-development
> **Current focus: Rally Prototype (Volleyball, Badminton, Table Tennis) — see section 0**

## 0. Current Focus: Rally Prototype

Before building the full platform, we build and test a prototype covering **only the rally family**:
**Volleyball, Badminton and Table Tennis**. They share one scoring engine and are the simplest to build.

Goals:
- Validate the scorer experience (+1, how-was-it-won panel, undo, close match) at real matches
- Validate the public match view (live score, set breakdown, commentary feed)
- Prove the core architecture (point-by-point event log, undo-until-close, commentary generation,
  sport configuration) so it becomes the template for every other family
- Produce reusable designs and working components for later versions

Prototype scope:
- Rally scoring engine with per-sport configuration (points per set, best of, win by 2, cap, deciding set)
- Rules set by the scorer before the start and changeable at any time during the match
- Scorer screen, public match screen, commentary feed, match summary
- Customisable "how" action catalogue per sport, ask-how / ask-who toggles
- Undo until close; post-close editing by organiser/admin
- Singles, doubles and team sides with player names / jersey numbers
- Single active scorer with take-over / hand-over; scorers can add other scorers by mobile, email or username

Everything else in this spec (other families, tennis, cricket, full event management, medal tally)
follows after the prototype is tested, using its designs and components.

## 1. Vision

A unified platform where **any organiser** can host a multi-sport event (sports meet,
college fest, corporate games), **score every match live, point by point,** from a phone, and give
spectators **one link** to see what is happening now, what is next, live scores, a live
commentary feed, results, standings and the overall medal table. All results are stored and archived.

## 2. Scope

### In Version 1
- Organiser accounts; any organiser can create and manage their own events
- Event setup: sports, categories, venues, teams/participants per sport with rosters (names, jersey numbers)
- Optional organisations (colleges, houses, companies) that teams/players are linked to for the overall medal tally
- Pre-built rule templates per sport, fully customisable
- Fixture formats: knockout, round-robin, groups → knockout, heats → final
- **Point-by-point live scoring** with optional detail (how the point was won, who scored)
- **Auto-generated live commentary** from scoring entries
- **Undo** available for the whole match until it is closed; admin-only editing after close
- Multiple scorers per match; organiser can also score
- Scorer access by mobile number, email or username; one active scorer with take-over
- Public live site with realtime score and commentary updates
- Optional livestream link per event and per match (link only, no hosting)
- League tables, brackets, overall medal / points table
- **Manual medal entry** for any sport name to any team/player
- Results archive

### Sports in Version 1
| Sport | Scoring model |
|---|---|
| Badminton | Rally |
| Table Tennis | Rally |
| Volleyball | Rally |
| Tennis | Rally (after prototype; game/deuce/tie-break rules) |
| Basketball | Multi-value points |
| Football | Timed points |
| Kabaddi | Timed points |
| Chess | Result only |
| Athletics | Ranked performance |
| Any other sport | Custom sport on any family, or manual medal entry |

### Not in Version 1 (planned later)
- Cricket (next after V1, dedicated engine — see 8.6)
- Player and team statistics dashboards (built from the same scoring data)
- Judged-sport model
- Offline scoring
- Push notifications, big-screen display mode
- Native mobile apps
- In-platform live streaming
- Languages other than English

## 3. Roles

| Role | Access |
|---|---|
| **Organiser (owner)** | Signs up with an account. Creates and owns events, configures everything, can score any match, can edit any score after close, invites co-organisers. |
| **Admin (co-organiser)** | Invited by the owner. Same permissions as the owner for that event, except deleting the event or managing other admins. |
| **Scorer** | Given access to a match by **mobile number, email or in-app username** (by the organiser or by another scorer of that match). Can score, undo and close the match while in control. **Cannot edit after close.** |
| **Spectator** | No login. Read-only public pages. |

People sign in with a mobile number, email or in-app username (one-time code by SMS / email once the
database is connected). Identities are normalised so the same person always matches
(e.g. email lower-cased, `@username`). Mobile numbers are entered with a **country code picker**
(default +91) and stored in international form, so "098765 43210" with India selected and
"+91 98765 43210" are the same person; numbers typed with "+" or "00" keep their own code.

### Single scorer, multiple people with access
- **Only one person scores a match at a time** (the "active scorer"); everyone else with access sees the
  live score but no scoring buttons
- Several people can have scoring access to the same match, so scoring never depends on one device
- **Take-over request:** anyone with access can ask to take over. The current scorer gets a pop-up with a
  **15-second countdown** and Allow / Decline buttons:
  - **Allow** → scoring passes to the requester immediately
  - **Decline** within 15 seconds → the current scorer keeps control and the requester is told it was declined
    (they may ask again later)
  - **No answer** within 15 seconds (e.g. the scorer's phone has died) → scoring passes to the requester automatically
  - The current scorer can keep scoring while the request is open; the new scorer continues from the exact
    score with full control, including undo
  - One pending request at a time; the requester can cancel it; it is voided if control changes another way
  - If nobody is scoring, a person with access takes control immediately
- **Organiser override:** the organiser never needs permission. They can take over scoring immediately
  (the current scorer is not asked, and any pending request is cancelled), remove any scorer, and add
  another one, e.g. when a scorer keeps declining requests
- **Hand over:** the active scorer can pass control to another person with access
- **Add a scorer:** the organiser **and any scorer** of the match can give access to another person by
  mobile number, email or username, e.g. when no second scorer was added and the scorer's battery is low
- **Remove a scorer:** organiser only (also ends their control if they were scoring)
- Whoever starts the match becomes the active scorer
- Every add, removal, take-over and hand-over is recorded in the match change log

## 4. Core Architecture: Point-by-Point Event Log

Every scoring action is stored as a **score event** in an append-only log. The score, the
commentary and (later) statistics are all **computed from this log**.

```
#1  10:02  Side A  +1  smash          actor: Player 1           by scorer "Court-1"
#2  10:03  Side B  +1  opponent_error actor: Player 2  on: P1   by organiser
#3  10:03  Side A  +1  (no detail)    actor: —                  by scorer "Court-1"
```

Each score event holds:
| Field | Purpose |
|---|---|
| `side` | Team / player side that receives the points |
| `points` | Points awarded (0 allowed, e.g. empty raid, card) |
| `action_key` | Optional action from the sport's action catalogue (e.g. `smash`, `three_pointer`) |
| `actor` | Optional player who scored / performed the action |
| `related_player` | Optional second player (assist, defender tackled, opponent who erred) |
| `period` | Set / game / half / quarter number |
| `clock` | Match clock at the time (timed sports) |
| `meta` | Extra sport-specific data (e.g. defenders touched in a raid) |
| `score_after` | Snapshot of the score after this event (for fast display) |
| `created_by`, timestamps, `version` | Audit and concurrency |

This design means commentary and future statistics need **no rewrite**: the data is captured from day one.

## 5. Undo & Editing Rules

### Match lifecycle
`Scheduled → Live → (Break) → Live → … → Closed`

### While the match is not closed (Live / Break)
- An **Undo** button is always active for the whole match, for every scorer and organiser/admin on that match
- Undo removes the **most recent entry in the match log** and can be pressed repeatedly to step back further
- Before undoing, the button shows what will be removed (e.g. "Undo: Player 1 +1, smash, 18–17") so a
  scorer does not unknowingly undo another scorer's point
- Undone entries are kept in the audit history (soft-deleted), never lost
- Undo also reverses automatic consequences (e.g. undoing a set-winning point re-opens that set)

### Closing a match
- A scorer or organiser/admin presses **Close match** after a confirmation showing the final result
- Closing locks scoring, finalises the result and updates standings / brackets / medal table

### After the match is closed
- **Only the organiser and admins** can change it
- They can edit any entry (points, side, action, player), add a missed entry, or delete an entry
- They can also re-open the match (returns it to Live with undo enabled again)
- Every post-close edit is recorded in the audit trail (who, when, old → new) and the public match page
  shows a small "Result corrected" marker
- Edits recompute: match score → winner → league table / bracket progression → medal table → commentary

### Concurrency
- New entries from multiple scorers are appended without conflict
- Undo / edit use a version check; if the log changed in the meantime, the user sees the updated log and confirms again

## 6. Scoring Flow & Detail Levels

### Basic flow (every sport)
1. Scorer taps **+** (or `+2`, `+3` etc.) on the side that won the point
2. If detail prompts are on, a quick bottom sheet appears:
   - **How?** — action buttons from the sport's catalogue (e.g. for badminton: Smash / Drop /
     Opponent misjudged / Into the net or out). Only shown for sports whose catalogue has "how" actions.
   - **Who?** — player picker showing names and jersey numbers of that side (e.g. basketball asks only this)
3. Scorer taps an option or **Skip** — the point is already counted; detail is optional
4. Commentary line is generated instantly

The point is recorded on the first tap, so detail prompts never slow down or block scoring.

### Detail level settings (per match, changeable at any time during the game)
| Setting | Effect |
|---|---|
| Ask **how** the point was won | Shows action catalogue after each point |
| Ask **who** scored | Shows player picker after each point |
| Both off (Quick mode) | Plain `+1`; commentary: "Player 1 scored a point" / "Team A scores" |

- Defaults come from the event's sport settings; scorers and organisers can toggle them mid-match
- "Ask who" is on by default for football, kabaddi and basketball (every point is credited to a player)
- Switching levels mid-match only affects new entries; existing entries keep their detail
- For singles (badminton, table tennis) the "who" is implied by the side, so only "how" is asked

### Action catalogue (customisable)
Each sport template ships with a default catalogue. For every action the organiser can set:
- Label (e.g. "Great smash")
- Points (e.g. +1, +2, +3, 0)
- Whether to ask for a player / a second player
- Commentary template(s)
- Enabled / hidden

Organisers can add, rename, hide or re-point actions **at any time, including mid-game**; changes apply to new entries.

## 7. Commentary

- Generated automatically from each score event using the action's commentary template
- Templates use placeholders, e.g.
  - `"{actor} wins the point with a great smash"`
  - `"{actor} plays a delicate drop shot — point {side}"`
  - `"{opponent} misjudges the shuttle — point to {actor}"`
  - `"{opponent} hits into the net / out — point to {side}"`
  - `"#{jersey} {actor} scores a three-pointer!"`
- Several templates per action are allowed; one is picked for variety
- Fallback when no detail is given: `"{actor or side} scored a point"`
- **System commentary** generated automatically: match start, set/game point, match point, set won,
  half-time, all-out, period end, match result
- Score context appended where useful, e.g. "(19–17, Game 2)"
- Commentary is **re-generated** when an entry is undone or edited, so the feed always matches the score
- Public match page shows the commentary feed live, newest first
- Organiser/scorer can add a free-text note to any entry (e.g. "Spectacular rally of 40 shots")

## 8. Scoring Families & Sport Configurations

Sports are grouped into **scoring families**. Each family has its own scoring engine (how points
turn into games, sets, periods and a winner, and which buttons the scorer sees). Each sport is a
**configuration** on top of its family: its own rules, buttons, action catalogue and commentary.
Configurations differ per sport and every value can be changed by the organiser.

| Family | How points are scored | Sports |
|---|---|---|
| **Rally (point-by-point)** | Every rally is won by one side for exactly 1 point; optional "how" (shot type) | Badminton, Tennis, Table Tennis, Volleyball |
| **Multi-value points** | Points come in 1, 2 or 3; scorer picks who scored | Basketball |
| **Timed points** | Points/goals within timed periods, sport-specific actions | Football, Kabaddi |
| **Result only** | Only the match result is recorded | Chess |
| **Ranked performance** | Each participant gets a time / distance / height, then ranked | Athletics |
| **Cricket** | Completely different: ball-by-ball, innings, overs, wickets | Cricket (dedicated engine, after V1) |

Engines are pluggable, so a new family (like cricket) is added as a new engine without changing the others.

### 8.1 Rally family — Badminton, Tennis, Table Tennis, Volleyball
Scorer taps **+1** on the side that won the rally, then optionally picks **how** it was won.

**Rules configuration**
| Setting | Badminton | Table Tennis | Volleyball |
|---|---|---|---|
| Points per set/game | 21 | 11 | 25 |
| Best of | 3 | 5 | 5 |
| Win by 2 | Yes | Yes | Yes |
| Point cap | 30 | none | none |
| Deciding set points | 21 | 11 | 15 |

**Rules are set by the scorer and can change at any time.** Grassroots events often use their own
points formats, and weather or time can force shorter sets, so:
- Sport templates only pre-fill the rules; the organiser sets them when creating the match
- The scorer confirms or edits the rules before pressing Start
- During the match the scorer (or organiser) can change any rule; the change applies to the set in
  progress and all later sets, while finished sets keep the scores they were played under
- A change that would instantly end the current set or the match is refused (the deciding point must be scored)
- Every change is recorded in the change log and announced in the commentary
  (e.g. "Rules changed from Game 2: Games to 15 · win by 2 · best of 3"); the public page shows the rules in force
- Rules cannot be changed after the match is closed (the organiser can re-open it)

**Tennis** uses the same rally scoring input, with its own point → game → set → match rules:
| Setting | Default |
|---|---|
| Point display | 0 / 15 / 30 / 40 / game |
| Deuce | Advantage (or no-ad / sudden-death deuce) |
| Games per set | 6, win by 2 |
| Tie-break | At 6–6, first to 7 points, win by 2 |
| Best of | 3 sets (or 5) |
| Final set | Normal set / tie-break / match tie-break to 10 |

Automatic: game/set completion, match completion, side switch reminder, server tracking (optional).
Supports singles / doubles / team.

**Default actions ("how")**
| Badminton | Tennis | Table Tennis | Volleyball |
|---|---|---|---|
| Great smash | Ace | Smash | Attack / spike kill |
| Delicate / perfect drop | Forehand winner | Loop / topspin winner | Block |
| Net shot | Backhand winner | Push / chop winner | Service ace |
| Clear / drive winner | Volley / overhead winner | Serve ace | Tip / dump |
| Opponent misjudged (left it in) | Drop shot winner | Edge / net ball | Opponent attack error |
| Opponent error — into the net | Opponent error — net | Opponent error — net | Opponent service error |
| Opponent error — outside the line | Opponent error — out | Opponent error — out | Opponent net touch / fault |
| Service fault by opponent | Double fault by opponent | Service fault by opponent | Rotation fault |

### 8.2 Multi-value points family — Basketball
4 quarters × 10 min (editable). Points and scorer only — no "how" prompt;
the button pressed (`+1`, `+2`, `+3`) is the shot type, then the scorer picks **who** scored.
| Button | Points | Asks |
|---|---|---|
| Free throw | +1 | Scorer (name / jersey) |
| Two-pointer | +2 | Scorer (name / jersey) |
| Three-pointer | +3 | Scorer (name / jersey) |

Commentary: `"#{jersey} {actor} scores a two-pointer"` / `"... a three-pointer!"`.
Match clock, quarters, optional overtime.

### 8.3 Timed points family — Football, Kabaddi
Common: match clock (start / pause / resume), period control, draw allowed or tie-break required (configurable).

**Football:** 2 halves × 45 min (editable), optional extra time and penalty shootout.
| Action | Points | Asks |
|---|---|---|
| Goal (open play / header / free kick / penalty) | +1 | Scorer, assist (optional) |
| Own goal | +1 to opponent | Player |
| Yellow card / red card | 0 | Player |
| Substitution | 0 | Player off, player on |
| Penalty shootout kick (scored / missed) | shootout tally | Player |

**Kabaddi:** 2 halves × 20 min (editable).
| Action | Points | Asks |
|---|---|---|
| Raid point (touch) | +1 per defender touched | Raider, defenders |
| Bonus point | +1 | Raider |
| Tackle point | +1 | Defender(s), raider tackled |
| Super tackle | +2 | Defender(s) |
| All-out | +2 | — |
| Technical point | +1 | — |
| Empty raid | 0 | Raider |
| Do-or-die raid (flag) | — | Raider |

### 8.4 Result only family — Chess
Win / Draw / Loss (1 – ½ – 0 by default, configurable). Formats: knockout, round-robin (Swiss later).
Result reason (optional): checkmate, resignation, time, stalemate, draw by agreement, repetition.
Optional tiebreak entry (rapid / armageddon). Commentary: "{white} beats {black} by checkmate".

### 8.5 Ranked performance family — Athletics
- Track (time, lower is better) and field (distance / height, higher is better)
- Heats → final; configurable number qualifying from heats
- Scorer enters each participant's mark; ranking is automatic
- Status markers: DNS, DNF, DQ, NM (no mark); optional attempts for field events
- Top 3 in the final become gold / silver / bronze automatically
- Commentary: "{athlete} clocks 11.24s and takes the lead", "{athlete} sets a new meet record"

### 8.6 Cricket family (after V1 — dedicated engine)
Cricket does not fit any other family and gets its own engine and scoring screen:
- Ball-by-ball entry: runs (0–6), extras (wide, no-ball, bye, leg-bye), wickets (type, fielder)
- Striker / non-striker / bowler tracking, overs, innings, target, required run rate
- Configurable overs, players per side, powerplays, super over
- Commentary like "Bowler to Batter, FOUR, driven through covers"
- Built on the same event log, undo and close rules as every other sport

### 8.7 Custom sport
Organiser names any sport, picks a family, and builds its configuration and action catalogue
(e.g. Kho-Kho → timed points with "Tag", "Dive" actions; Throwball → rally).

## 9. Teams, Organisations, Formats & Standings

### Teams per sport
- The organiser adds teams / individual participants **to each specific sport and category**
  (e.g. "Team Alpha" in Men's Football, "Riya Sharma" in Women's Singles Badminton)
- A team or player can be added fresh, or picked from people already registered in the event
  (so one player can appear in several sports)
- Rosters (player names, jersey numbers) are maintained per team per sport

### Saved teams (CricHeroes-style)
- A **team** lasts beyond one event: name, sport (one per team), city, squad, captain, admins. Name + city must
  be unique per sport. Whoever creates it manages it and can add other admins (by mobile / email)
- **Every player is name + mobile number** (or email), everywhere: teams, single matches, ties, tournament
  entries and meet registrations. The mobile is the player's unique ID: it finds the player card already
  registered to that number (made by anyone) or creates one, which becomes the player's when they sign in with
  it. Numbers are stored only in the private contacts table, never in the public team / match / tournament
- Adding players: one by one (name, mobile, jersey), **paste a list** ("Name, mobile" per line, or two
  spreadsheet columns), pick an existing card, or share the **invite link**: a player opens it, signs in with
  their mobile and joins at once (no approval). **New link** stops the old one working
- Squad: jersey numbers, captain (C), remove; tap a name for the player card
- **Pick a saved team** in a volleyball match, a team tie, a team tournament entry or a meet registration; the
  squad fills in. Tournament entries remember the team, so the same team can't enter twice. A captain
  registering for a meet can create the team right there; players they add join the team too
- Viewers need no login: team pages are public links; only joining or managing needs sign-in

### Organisations (for the overall medal tally)
- Optionally, the organiser creates **organisations** in the event (e.g. colleges, schools, houses,
  companies, clubs) and links any team or player to one
- Medals won by a linked team/player count towards **that organisation** in the overall medal tally
- Teams/players not linked to an organisation appear in the tally under their own name
- Links can be changed at any time; the tally recalculates
- Each organisation gets a public page with all its teams, results and medals

### Formats
- **Knockout:** auto bracket, byes, seeding (manual or random), optional third-place match or shared bronze
- **Round-robin / league:** points per win/draw/loss configurable; tiebreakers: points → head-to-head → score difference → score for
- **Groups → knockout:** top N per group advance
- **Heats → final:** for athletics
- Fixtures can be auto-generated or created manually; each has date, time, venue/court and scorer

### Tournaments (CricHeroes-style)
Built in this order: tournaments first (with singles / doubles / volleyball team entries), then team ties.

1. **Create** — organiser sets name, sport, entry type (singles, doubles, or team), venue, dates, match rules
   and points (default **win 2, loss 0**; editable)
2. **Entries** — add teams / pairs / players; optional **seed** numbers (1 = top seed)
3. **Structure** — one of:
   - **League** — everyone plays everyone once; points table decides the winner
   - **Knockout** — seeded bracket (seeds 1 and 2 can only meet in the final; byes go to top seeds)
   - **Groups → knockout** — like CricHeroes: create Group A, B, C…, assign entries manually or
     automatically by seed (snake order so top seeds are spread out), set how many qualify per group;
     each group plays a round-robin with its own points table; qualifiers go into a seeded knockout
     (group winners kept apart, e.g. A1 v B2, B1 v A2)
4. **Fixtures** — generated automatically (round-robin rounds inside groups; bracket matches appear as
   soon as both sides are known). Each fixture is a normal live-scored match; tournament scorers get
   access to all its matches
5. **Points table** per group: played, won, lost, points, games won/lost, points scored/conceded.
   Ordered by the sport's **official ranking** by default (changeable at any time; see "Official rules and
   templates" below), or **Custom**: organiser's points → head-to-head (two level) → game difference →
   point difference
6. **Advancement** — knockout winners move on automatically when a match is closed; if the organiser
   corrects a closed result, the next match is updated if it hasn't started yet

7. **Third-place match** (optional) — the organiser can add a play-off between the semi-final losers when
   creating the tournament or at any time before it is set up; the podium shows 🏆 / 🥈 / 🥉
8. **Team events** — for badminton / table tennis "team" entries, every fixture is a team tie (below);
   the points table counts ties won, then matches won/lost (MD), then games

### Official rules and templates
Sources: Laws of Badminton and BWF General Competition Regulations (GCR), ITTF Statutes 2025 (Laws 2.11–2.15,
Regulations 3.7.5–3.7.7), FIVB Official Volleyball Rules 2025–2028, FIVB Event Regulations, FIVB Beach rules.

- **Rule presets** on every rules form (match, tie, tournament, scorer's change of rules), marked
  "Official" where they follow the laws; the numbers stay editable under "Customise the numbers":
  - Badminton: best of 3 to 21 (cap 30, default), best of 3 to 15 (cap 21, BWF 3×15 system — available, not
    the default), one game to 21, one game to 15
  - Table tennis: best of 5 / 7 / 3 games to 11
  - Volleyball: indoor best of 5 / 3 to 25 (deciding set 15), beach best of 3 to 21 (third set 15, change
    ends every 7 points, every 5 in the third set)
- **Rankings for group tables**:
  - BWF (GCR 16): matches (ties) won; two level → their match; three or more → (ties: match difference)
    game difference, point difference, with head-to-head whenever two remain; a player who retires or gives
    a walkover has all group results deleted and is ranked last
  - ITTF (3.7.5): 2 points for a win, 1 for a played loss, 0 for a walkover / retirement; level entries are
    separated using only the matches between them (match points, then individual-match, game and point
    ratios), starting again whenever some are separated
  - FIVB: wins → match points (3-0 / 3-1 → 3:0, 3-2 → 2:1) → sets ratio → points ratio → head-to-head; a
    forfeit counts 3-0 with 25-0 sets
- **Official team systems** for ties: Thomas / Uber Cup (S, D, S, D, S), Sudirman Cup (XD, WS, MS, WD, MD),
  ITTF Swaythling, Corbillon, Olympic (max two matches per player), best of 7 and best of 9. Lettered
  systems: each captain gives letters (A, B, C / X, Y, Z) to players on the tie page and the singles fill in
  automatically; a letter can't change once its match has started
- **Tournament templates** for new organisers (every setting stays editable): Club night, Official
  knockout, Championship (groups → knockout), Team championship, League season (home and away), Beach
  volleyball. The form shows a one-line summary of what the organiser will get
- **Guidance**: suggested number of seeds per BWF GCR 11.7 (2 / 4 / 8 / 16 for <16 / 16–31 / 32–63 / 64+
  entries) and groups of about four
- **Home and away**: leagues and groups can play every opponent twice (sides swapped in the second half)

### Toss, serving and change of ends
- Before the start the scorer flips a coin in the app (or enters who won), records the winner's choice
  (serve, receive or pick a side), who serves first and which side starts on the scorer's left
- Serving is then tracked automatically: badminton and volleyball — the rally winner serves (badminton:
  the game winner serves first next game; volleyball: first serve alternates each set); table tennis —
  service alternates every 2 points, every point from deuce, and the first server alternates each game
- Ends change after every set and once halfway through the deciding set (badminton 11 of 21, table tennis
  5 of 11, volleyball 8 of 15); the scorer is told and the +1 buttons swap to match the court
- Commentary announces the toss and changes of ends; the scoreboard marks the serving side
- Volleyball: a **new toss before the deciding set** (FIVB 7.1) — the scorer records who serves and which
  side starts on the left before its first rally
- Optional "change ends every N points" (beach volleyball: 7, and 5 in the deciding set)
- **Interval reminders** after the point that starts one: badminton 60 s when the leader reaches 11 and
  120 s between games; table tennis 1 minute between games; volleyball 3 minutes between sets

### Scheduling
- Tournaments list their **courts / tables**; every fixture can have a **date, time and court**, and the
  schedule is copied onto its match or tie
- **Auto-schedule**: first day, first and last start time, minutes per match, courts and required rest;
  fills courts slot by slot, never books a player twice in a slot, keeps the rest gap, plays knockout
  rounds after the matches that decide them, continues on the next day; can keep times already set
- **Import from a spreadsheet**: paste rows "Team A vs Team B, date, time, court" (Excel / Google Sheets
  rows work); matched to fixtures by the two names, with clear errors for unknown names or dates
- **Bulk entries**: paste a list of players, pairs or teams (one per line, optional "| seed")
- Schedule tab grouped by day with times and courts, per-fixture editing, "Copy schedule as text" for
  WhatsApp; single matches and team ties take an optional date and start time

### Editable fixtures and extra rounds
- **Edit any fixture before it starts**: change who plays (e.g. after a withdrawal), swap sides, or delete
  it (knockout fixtures that decide a later round can be re-paired but not deleted); its match or tie is
  updated or removed with it
- **Add a match** to any group of the main event or of a round-robin round
- **More rounds** on top of the main structure, each with its own name: a round-robin round in one or more
  groups with its own tables (e.g. Super 4), a seeded knockout with optional third place (e.g. a Plate for
  "didn't make the knockout"), or a set of one-off matches; rounds can be removed while none of their
  matches has started. Extra rounds never change the main tables, qualification or champion

### Retirements, walkovers and no result
- A match that isn't played to a finish is closed by the scorer (or organiser) with how it ended:
  - **Retired** — one side retired during play; the opponent is awarded the match; the score so far is kept
  - **Walkover** — one side didn't play (can be recorded before the match starts); the other side is awarded it
  - **No result** — abandoned; no points for either side
- Awarded matches count as wins in points tables, ties and brackets
- The organiser can change the recorded outcome after close; re-opening the match clears it

### Team ties (badminton / table tennis team events)
- A tie between two teams consists of N matches (e.g. 5); the first team to win a majority wins and the
  remaining matches are not played (organiser may choose to play them anyway)
- Each team has a player list of any size
- Line-ups either decided in advance (all matches entered with players) or decided at the start of each
  match: the scorer picks singles / doubles and the starting players from each team's list
- Matches inside a tie never ask "who scored" (the players are known from the line-up)
- Volleyball stays a single team match with optional "who scored"

### Navigation, home page and match creation
- **Side menu (☰)** in the header: Home, Create a match, Create a tournament, Create a sports meet, Team tie,
  Players, My card; a red badge counts registration requests waiting for the signed-in person
- **Create a match in steps** (made for phones): 1) sport, 2) format and rules for that sport, 3) players (with
  "+ Card"), with scorers / title / venue / date / livestream under "More options"; then straight to the scorer
- **Match summary** after closing: congratulations banner with the winner ✓, the score by set, links to the
  winners' player cards, then "Start another match" / back to the tournament or tie
- **Home page**: quick create buttons; Live now; **Your events** (meets and tournaments the person runs, admins,
  scores, plays in through their card, registered a team for, or opened recently on this device); **Near you**
  (live and upcoming events whose city matches the city the person sets once); team ties; upcoming single
  matches; results

### Sports meets and team registration
- **A meet** has a name, venue, city and dates, and **events**: a sport and format (e.g. Badminton · Singles,
  Volleyball · Team; several of the same, e.g. women's / under-17). Each event is its own tournament, created
  from a template (Championship by default; team championship for team events)
- **Admins per event** (optional): mobile / email; they manage that event's tournament like the organiser
  (fixtures, schedule, approving its teams) and can score its matches. Blank = the organiser runs it
- **Registration link** (copy / share on WhatsApp). The registration page: 1) choose the event, 2) open the
  organiser's Google Form (player details, fees) and confirm it is submitted, 3) team / pair name, players
  ("+ Card"), extra contact, message → **request sent**. Captains must sign in with mobile or email
- **Organiser / event admin**: notified in the app (menu badge, live); each request shows team, players, contact,
  form confirmation and message; **Approve** adds the team as an entry of the event's tournament (only while
  its fixtures aren't generated); **Reject** with a reason shown to the team. Captains see Waiting / Approved /
  Rejected and can withdraw a waiting request
- **Privacy**: requests (with the captain's contact) are visible only to the captain and that event's managers
- **Organiser settings**: open / close registration, form link, information for teams (fees, deadlines), city;
  add or remove events (an event with teams or fixtures can't be removed), change admins
- Later: email / push notifications for new requests, online fee payment, a medal tally across the meet

### Sign-in and email reports
- **Sign in with a mobile number** (one-time SMS code). The mobile number is the player's ID everywhere.
  While SMS isn't set up for the database, a small "use email instead" link signs in with an email code
- **Email is for reports, not sign-in**: a person adds an address on My card and confirms it with a code
  emailed to it. Players get a detailed performance report (record, by-sport table, form, medals, winning
  shots, recent results with scores, upcoming matches) on request and as a **monthly summary** on the 1st.
  Organisers and event admins get a tournament report (entries, played / to play, podium, results, coming up)
  or a sports meet report (per event: entries, waiting / approved registrations, results)
- Reports are built and sent by the app's server (Brevo API); the database only accepts report addresses
  from the server (shared secret), requests are limited to one per 10 minutes, and nobody can read another
  person's report address

### Player cards and score cards
- **One player card per person**, for all sports: name, sports, club, playing hand, and a record computed from
  every match it is linked to: played, won, win %, titles, last five results, per-sport W–L / games / points,
  medals (tournament podiums), winning shots (from "how" + "who" details), teams and pairs played for, live
  and upcoming matches and all results
- **Who creates it**: an organiser (must enter the player's mobile number and / or email) or the player
  themselves. Usernames can't own a card, since they can't prove who someone is
- **Ownership**: whoever signs in with one of the card's numbers / emails owns it and can edit it, add more
  contacts or hide it from search. The creator can edit it too
- **Profile the player edits at any time** ("Edit my profile" on My card or their card page): name, year of
  birth (the card shows the age), club, sports and **playing style per sport** — badminton: hand, style
  (attacking / defensive / all-round), best event; table tennis: hand, grip (shakehand / penhold), style;
  volleyball: hand, position. **The record is never editable**: played, won, titles, form, medals and points
  are always worked out from the scored matches
- **Privacy**: the public card only shows masked hints ("+91 ••••• 43210", "r•••@gmail.com"); full contacts
  are stored separately and readable only by whoever added them and by the player (database row-level security)
- **Reuse**: every player field asks for name + mobile number, which links the player's card automatically; a
  "+ Card" picker also searches existing cards. Pasted lists take the number after each name
  ("Riya 98765 43210 / Karan 91234 56789 | 1"); tournament entries show a 🪪 link
- **Always accessible**: "Players" and "My card" in the header; profile pages are public links
- **Score card**: one compact match card, identical across sports (sides, finished set scores, live score,
  server, status, schedule or outcome), used on the home page and player profiles; the player's side is marked

## 10. Medal / Points Table
- Medals awarded **automatically** from closed results (knockout final, league winner, athletics final)
- **Manual medal entry**: organiser types any sport/event name and awards any medal (gold/silver/bronze or a custom medal) to any team or player
- Table modes: medal count (gold-first ranking) or points (e.g. gold 5, silver 3, bronze 1 — configurable)
- Overall tally grouped by **organisation** (linked teams/players), with unlinked teams/players listed individually
- Per-sport medal view also available (by team/player)
- Manual medals can also be awarded directly to an organisation

## 11. Screens

### Public (no login)
- Event home: Live now, Up next, Recent results, livestream link
- Schedule (filter by day, venue, sport)
- Match page: live score, status, **live commentary feed**, set/period breakdown, stream link
- Sport page: fixtures, bracket / league table, final standings
- Medal / points table
- Team / participant page
- Events archive

### Organiser / Admin
- Sign up / login, my events dashboard
- Create event wizard: details → sports (from templates) → customise rules & action catalogue → venues
- Teams / participants per sport & category, rosters with jersey numbers (manual + CSV upload)
- Organisations: create, link teams/players for the overall medal tally
- Fixture generator and editor, scorer assignment
- Scoring access per match (add / remove people by mobile, email or username)
- Manual medal entry
- Closed-match editor (edit / add / delete entries, re-open match) with audit history
- Livestream links, admin invitations

### Scorer
- Sign in → my matches → scoring screen (or take over if someone else is scoring)
- Large `+` buttons per side (and `+2` / `+3` where the sport uses them)
- Detail bottom sheet (how / who) with Skip
- **Undo** button always visible (shows what it will undo)
- Detail level toggles (ask how / ask who)
- Live score + commentary timeline
- Period controls, Close match (with confirmation)

## 12. Tech Stack

> Implemented: Supabase stores matches, tournaments and ties as JSON documents in one table with realtime
> and row-level security (organiser or listed scorer may write; anyone may read). Sign-in by one-time code
> (email; SMS with a provider). Without Supabase settings the app runs in prototype mode on browser storage.
> Setup: `docs/DATABASE_SETUP.md`.

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, mobile-first, installable PWA |
| Database | Supabase (PostgreSQL) — free tier for initial data |
| Auth | Supabase Auth for organisers/admins and scorers (one-time code by SMS or email) |
| Realtime | Supabase Realtime for live scores and commentary |
| Security | Postgres Row Level Security per event / role (scorer cannot edit closed matches) |
| Hosting | Vercel (free tier) + Supabase |

Note: Supabase free-tier projects pause after a period of inactivity; upgrade before relying on it for a live event.

## 13. Data Model (outline)
- `organisers` (auth users), `event_members` (event ↔ user, role: owner | admin)
- `events` (name, dates, location, livestream_url, medal_table_mode)
- `venues`
- `event_sports` (sport, scoring_family, rules_config JSON, format, default detail settings)
- `action_catalogue` (event_sport, key, label, points, asks_actor, asks_related, commentary_templates, enabled, sort)
- `categories` (e.g. Men's Singles U-19)
- `organisations` (event, name, short name, logo) — optional grouping for the medal tally
- `participants` (event-level person: name, organisation_id optional)
- `teams` (event_sport / category, name, organisation_id optional)
- `team_members` (team, participant, jersey_number)
- `entries` (category ↔ team or individual participant registered in that sport)
- `stages` / `groups` (group stage, knockout rounds, heats)
- `rule_changes` (match, from_set, rules JSON, at, by) — rules changed during a match
- `matches` (fixture, venue, start time, status, rules JSON, closed_at, closed_by, livestream_url, detail settings, version)
- `match_sides` (team/participant per side or lane)
- `score_events` (match, side, points, action_key, actor_id, related_id, period, clock, meta JSON,
  score_after, note, created_by, undone_at, undone_by, version)
- `score_event_history` (audit trail of post-close edits: old → new, by, at)
- `commentary` (derived view / table regenerated from score_events + system events)
- `performances` (athletics marks, attempts, status)
- `medals` (event, sport label, medal type, team / participant / organisation, source: auto | manual)
- `match_scorers` (match, user identity, added_by, added_at) — people with scoring access
- `matches.active_scorer` — the one person currently in control of scoring

## 14. Roadmap

| Phase | Deliverable |
|---|---|
| 0 | Spec agreed (this document) |
| P — Rally prototype | Volleyball, badminton, table tennis: rally engine, scorer screen, public match view, commentary, undo/close — tested before the phases below |
| 1 — Foundation | Next.js + Supabase setup, schema, organiser/admin auth, event / venue / sport setup, organisations, teams & participants per sport, rosters with jersey numbers (incl. CSV) |
| 2 — Fixtures & access | Knockout, round-robin, groups → knockout generators, manual fixtures, schedule, scorer access and assignment |
| 3 — Scoring engine core | Point-by-point event log, Quick mode `+1/+2/+3`, Undo (until close), Close match, post-close admin editing with audit, multi-scorer realtime sync, match lifecycle |
| 4 — Sport rules | Rally family (badminton, tennis, table tennis, volleyball), multi-value points (basketball), timed points (football, kabaddi), result only (chess) — auto game/set/period/match completion |
| 5 — Detail & commentary | Action catalogues with defaults, how/who bottom sheet, detail toggles mid-match, commentary templates & generator, system commentary, catalogue editor for organisers |
| 6 — Public live site | Event home, schedule, live match page with commentary feed, realtime updates, livestream links |
| 7 — Results & standings | League tables, brackets & progression, medal table (auto + manual), archive |
| 8 — Athletics | Ranked performance, heats → final, auto medals, athletics commentary |
| 9 — Pilot | Run at a real event, feedback, fixes |
| Next | Cricket engine (ball-by-ball with commentary), player/team statistics, notifications, offline scoring, big-screen mode, judged sports |
