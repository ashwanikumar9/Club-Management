# Multi-Sport Event Scoring Platform — Version 1 Spec

> Working title: TBD (product name to be chosen later)
> Status: Agreed blueprint, pre-development

## 1. Vision

A unified platform where **any organiser** can host a multi-sport event (sports meet,
college fest, corporate games), **score every match live** from a phone, and give
spectators **one link** to see what is happening now, what is next, live scores,
results, standings and the overall medal table. All results are stored and archived.

## 2. Scope

### In Version 1
- Organiser accounts; any organiser can create and manage their own events
- Event setup: sports, categories, venues, teams/participants
- Pre-built rule templates per sport, fully customisable
- Fixture formats: knockout, round-robin, groups → knockout, heats → final
- Live scoring (team/participant level) with **edit at any time**
- Multiple scorers per match; organiser can also score
- Scorer access via code
- Public live site with realtime updates
- Optional livestream link per event and per match (link only, no hosting)
- League tables, brackets, overall medal / points table
- **Manual medal entry** for any sport name to any team/player
- Results archive

### Sports in Version 1
| Sport | Scoring model |
|---|---|
| Badminton | Sets / rally |
| Table Tennis | Sets / rally |
| Volleyball | Sets / rally |
| Football | Timed points |
| Kabaddi | Timed points |
| Chess | Result only |
| Athletics | Ranked performance |
| Any other sport | Manual medal entry (no live scoring) |

### Not in Version 1 (planned later)
- Cricket (next after V1)
- Player-level scoring, live commentary feed, player stats
- Judged-sport model
- Offline scoring
- Push notifications, big-screen display mode
- Native mobile apps
- In-platform live streaming
- Languages other than English

## 3. Roles

| Role | Access |
|---|---|
| **Organiser** | Signs up with an account. Creates events, owns them, configures everything, can score any match, can edit any score or result, can invite co-organisers. |
| **Scorer** | Joins with an access code (no full account needed). Code scoped to an event or specific matches. Can score and edit scores of assigned matches. |
| **Spectator** | No login. Read-only public pages. |

Multiple scorers can score the same match at the same time; all scorer screens stay in sync in realtime.

## 4. Core Architecture Principle: Event-Log Scoring

Every scoring action is stored as a **score event** (an entry in a log), not as an overwritten total.
The displayed score is **computed from the log**.

```
#1  10:02  Team A  +1  raid_point      by scorer "Court-1"
#2  10:03  Team B  +1  tackle_point    by organiser
#3  10:05  Team A  +2  all_out         by scorer "Court-1"
```

Why:
- **Edit at any time** — any event can be corrected or deleted, not only the last one
- **Multiple scorers** — new events from different scorers are appended without overwriting each other
- **Audit trail** — every change records who, when and what changed (old → new)
- **Future-proof** — V2 adds optional fields (player, assist, note) to the same events to produce
  CricHeroes-style commentary and player stats without a rewrite

### Editing rules
- Any score event can be edited or deleted during or after the match (organiser and assigned scorers)
- Finished matches can be re-opened or corrected by the organiser
- Edits recompute: match score → match winner → league table / bracket progression → medal table
- Edits are logged (original value kept); public pages update in realtime
- Concurrent edits to the same event are protected with a version check (the second writer is asked to refresh)
- Optional "manual final score override" for organisers when the log is not needed

## 5. Scoring Models & Templates

Each sport uses a template built on a scoring model. Organisers can use it as-is or change any value.

### 5.1 Sets / rally — Badminton, Table Tennis, Volleyball
| Setting | Badminton | Table Tennis | Volleyball |
|---|---|---|---|
| Points per set/game | 21 | 11 | 25 |
| Best of | 3 | 5 | 5 |
| Win by 2 | Yes | Yes | Yes |
| Point cap | 30 | none | none |
| Deciding set points | 21 | 11 | 15 |

Scorer UI: `+1` per side, auto set completion, auto match completion. Supports singles/doubles/team.

### 5.2 Timed points — Football, Kabaddi
**Football:** 2 halves × 45 min (editable), goal +1, optional extra time and penalty shootout, optional cards (yellow/red) recorded as events with no points.

**Kabaddi:** 2 halves × 20 min (editable). Buttons per team:
| Action | Points |
|---|---|
| Raid point | +1 |
| Bonus point | +1 |
| Tackle point | +1 |
| Super tackle | +2 |
| All-out | +2 |
| Technical point | +1 |

Shows score per half and total. Organisers can rename or add custom buttons with custom point values.

Common: match clock (start/pause/resume), period control, draw allowed or tie-break required (configurable).

### 5.3 Result only — Chess
Win / Draw / Loss (1 – ½ – 0 by default, configurable). Formats: knockout, round-robin (Swiss later).
Optional tiebreak entry (e.g. armageddon / rapid result).

### 5.4 Ranked performance — Athletics
- Event types: track (time, lower is better), field (distance/height, higher is better)
- Heats → final; configurable number qualifying from heats
- Scorer enters each participant's mark; ranking is automatic
- Status markers: DNS, DNF, DQ, NM (no mark)
- Top 3 in the final become gold / silver / bronze automatically

### 5.5 Custom sport
Organiser names any sport and picks one of the above models (e.g. Kho-Kho → timed points, Throwball → sets).

## 6. Formats & Standings
- **Knockout:** auto bracket, byes, seeding (manual or random), optional third-place match or shared bronze
- **Round-robin / league:** points per win/draw/loss configurable; tiebreakers: points → head-to-head → score difference → score for
- **Groups → knockout:** top N per group advance
- **Heats → final:** for athletics
- Fixtures can be auto-generated or created manually; each has date, time, venue/court and scorer

## 7. Medal / Points Table
- Medals awarded **automatically** from sport results (knockout final, league winner, athletics final)
- **Manual medal entry**: organiser types any sport/event name and awards any medal (gold/silver/bronze or a custom medal) to any team or player — for sports not scored on the platform
- Table modes: medal count (gold-first ranking) or points (e.g. gold 5, silver 3, bronze 1 — configurable)
- Grouping by team, institution or house

## 8. Screens

### Public (no login)
- Event home: Live now, Up next, Recent results, livestream link
- Schedule (filter by day, venue, sport)
- Match page: live score, status (Upcoming / Live / Break / Finished), timeline, stream link
- Sport page: fixtures, bracket / league table, final standings
- Medal / points table
- Team / participant page
- Events archive

### Organiser
- Sign up / login, my events dashboard
- Create event wizard: details → sports (from templates) → customise rules → venues
- Teams / participants (manual + CSV upload)
- Fixture generator and editor, scorer assignment
- Scorer access codes (generate, revoke)
- Manual medal entry
- Score correction / match re-open
- Livestream links

### Scorer
- Enter code → my matches → scoring screen
- Large buttons, high contrast, one-handed use
- Live timeline with edit/delete on each entry
- Period controls, finish match

## 9. Tech Stack
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, mobile-first, installable PWA |
| Database | Supabase (PostgreSQL) — free tier for initial data |
| Auth | Supabase Auth for organisers; access codes for scorers |
| Realtime | Supabase Realtime for live scores |
| Security | Postgres Row Level Security per event / role |
| Hosting | Vercel (free tier) + Supabase |

Note: Supabase free-tier projects pause after a period of inactivity; upgrade before relying on it for a live event.

## 10. Data Model (outline)
- `organisers` (auth users), `event_members` (event ↔ organiser, role)
- `events` (name, dates, location, livestream_url, medal_table_mode)
- `venues`
- `event_sports` (sport, scoring_model, rules_config JSON, format)
- `categories` (e.g. Men's Singles U-19)
- `teams`, `participants`, `team_members`
- `stages` / `groups` (group stage, knockout rounds, heats)
- `matches` (fixture, venue, start time, status, livestream_url, version)
- `match_sides` (team/participant per side or lane)
- `score_events` (match, side, type, points, period, meta JSON, created_by, edited_at, deleted_at, version)
- `score_event_history` (audit trail of edits)
- `performances` (athletics marks, status)
- `medals` (event, sport label, medal type, team/participant, source: auto | manual)
- `scorer_codes` (code hash, event, allowed matches, expiry)

## 11. Roadmap
| Phase | Deliverable |
|---|---|
| 0 | Spec agreed (this document) |
| 1 | Project setup, Supabase schema, organiser auth, event/sport/team/venue setup |
| 2 | Fixture formats & generators, schedule, scorer codes & assignment |
| 3 | Scoring engine (event log + editing + multi-scorer sync); sets, timed points, result-only models |
| 4 | Public live site with realtime updates and livestream links |
| 5 | Standings, brackets, medal table (auto + manual), archive |
| 6 | Athletics (ranked performance, heats → final) |
| 7 | Pilot at a real event, feedback, fixes |
| Next | Cricket, player-level scoring & commentary, stats, notifications, offline, big-screen mode |
