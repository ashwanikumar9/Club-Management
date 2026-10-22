# Multi-Sport Event Scoring Platform — Version 1 Spec

> Working title: TBD (product name to be chosen later)
> Status: Agreed blueprint, pre-development

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
- Scorer access via code
- Public live site with realtime score and commentary updates
- Optional livestream link per event and per match (link only, no hosting)
- League tables, brackets, overall medal / points table
- **Manual medal entry** for any sport name to any team/player
- Results archive

### Sports in Version 1
| Sport | Scoring model |
|---|---|
| Badminton | Rally |
| Tennis | Rally |
| Table Tennis | Rally |
| Volleyball | Rally |
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
| **Scorer** | Joins with an access code (no full account needed). Code scoped to an event or specific matches. Can score, undo and close assigned matches. **Cannot edit after close.** |
| **Spectator** | No login. Read-only public pages. |

Multiple scorers can score the same match at the same time; all scorer screens stay in sync in realtime.

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
- Scorer access codes (generate, revoke)
- Manual medal entry
- Closed-match editor (edit / add / delete entries, re-open match) with audit history
- Livestream links, admin invitations

### Scorer
- Enter code → my matches → scoring screen
- Large `+` buttons per side (and `+2` / `+3` where the sport uses them)
- Detail bottom sheet (how / who) with Skip
- **Undo** button always visible (shows what it will undo)
- Detail level toggles (ask how / ask who)
- Live score + commentary timeline
- Period controls, Close match (with confirmation)

## 12. Tech Stack
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, mobile-first, installable PWA |
| Database | Supabase (PostgreSQL) — free tier for initial data |
| Auth | Supabase Auth for organisers/admins; access codes for scorers |
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
- `matches` (fixture, venue, start time, status, closed_at, closed_by, livestream_url, detail settings, version)
- `match_sides` (team/participant per side or lane)
- `score_events` (match, side, points, action_key, actor_id, related_id, period, clock, meta JSON,
  score_after, note, created_by, undone_at, undone_by, version)
- `score_event_history` (audit trail of post-close edits: old → new, by, at)
- `commentary` (derived view / table regenerated from score_events + system events)
- `performances` (athletics marks, attempts, status)
- `medals` (event, sport label, medal type, team / participant / organisation, source: auto | manual)
- `scorer_codes` (code hash, event, allowed matches, expiry, revoked)

## 14. Roadmap

| Phase | Deliverable |
|---|---|
| 0 | Spec agreed (this document) |
| 1 — Foundation | Next.js + Supabase setup, schema, organiser/admin auth, event / venue / sport setup, organisations, teams & participants per sport, rosters with jersey numbers (incl. CSV) |
| 2 — Fixtures & access | Knockout, round-robin, groups → knockout generators, manual fixtures, schedule, scorer codes and assignment |
| 3 — Scoring engine core | Point-by-point event log, Quick mode `+1/+2/+3`, Undo (until close), Close match, post-close admin editing with audit, multi-scorer realtime sync, match lifecycle |
| 4 — Sport rules | Rally family (badminton, tennis, table tennis, volleyball), multi-value points (basketball), timed points (football, kabaddi), result only (chess) — auto game/set/period/match completion |
| 5 — Detail & commentary | Action catalogues with defaults, how/who bottom sheet, detail toggles mid-match, commentary templates & generator, system commentary, catalogue editor for organisers |
| 6 — Public live site | Event home, schedule, live match page with commentary feed, realtime updates, livestream links |
| 7 — Results & standings | League tables, brackets & progression, medal table (auto + manual), archive |
| 8 — Athletics | Ranked performance, heats → final, auto medals, athletics commentary |
| 9 — Pilot | Run at a real event, feedback, fixes |
| Next | Cricket engine (ball-by-ball with commentary), player/team statistics, notifications, offline scoring, big-screen mode, judged sports |
