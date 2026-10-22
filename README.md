# Rally Scorer (prototype)

First prototype of the multi-sport event scoring platform described in [`docs/SPEC.md`](docs/SPEC.md).
It covers the **rally family**: Badminton, Table Tennis and Volleyball.

## What it does

- **Tournaments** (CricHeroes-style): league, seeded knockout, or groups → knockout. Add entries and seeds,
  create groups and assign entries manually or automatically by seed, generate fixtures, follow points
  tables and the bracket; winners move on automatically and the champion is shown. Optional third-place match
- **Editable fixtures and extra rounds**: re-pair, swap or delete fixtures before they start, add matches to
  groups, and add named rounds (round-robin, knockout or one-off matches) such as a Super 4 or a Plate
- **Scheduling**: courts, date / time / court per fixture, auto-schedule with rest between matches,
  spreadsheet import, bulk entry lists, a Schedule tab and "copy as text" for sharing
- **Team ties** (badminton / table tennis): two teams with player lists play 1–9 matches; line-ups are entered in
  advance or picked (singles / doubles and players) as each match starts; the tie stops once a team wins the
  majority, unless the organiser chooses to play all matches. Works standalone and inside tournaments
- **Retirements, walkovers and no result** when closing an unfinished match; awarded matches count as wins
- Create a single match (singles / doubles, or team for volleyball) with standard rules pre-filled and editable
- Scorer sets the rules before the start and can change them at any time during the match
  (e.g. shorter games because of weather); changes apply from the current set and are announced
- One active scorer at a time. Anyone with scoring access can request a take-over: the scorer gets 15
  seconds to allow or decline, and silence (e.g. a dead phone) passes scoring over automatically. The organiser takes over immediately without asking. Any scorer
  can give access to someone else by mobile number (with country code), email or username
- Toss in the app (coin flip, choice, first server, starting side); serving and change of ends tracked
  automatically per sport, with the +1 buttons laid out like the court
- Point-by-point scoring with big `+1` buttons
- Optional "how" (shot type) and "who" (player / jersey) prompts after each point, switchable mid-match
- Auto-generated live commentary, game/set point, match point and result lines
- **Undo** available for the whole match until it is closed
- After close, only the organiser can edit, insert or delete points (with a change log) or re-open
- Public match view with live score, set breakdown, commentary and optional livestream link
- Editable shot-type catalogue and commentary lines per match

## Run it

Needs Node.js 20.9 or newer (22 LTS recommended). Check your computer first:

```bash
node scripts/check-env.mjs
```

Then:

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring engine tests
```

To try it on a phone on the same Wi-Fi, run the production server (the dev server only accepts
requests from the computer itself):

```bash
npm run build
npm start -- -H 0.0.0.0   # then open http://<computer-ip>:3000 on the phone
```

### Database (live on every phone)

Connect Supabase to share live scores between devices, sign in with a one-time code and enforce who may
change what. Step-by-step: [`docs/DATABASE_SETUP.md`](docs/DATABASE_SETUP.md). The app reads
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the schema is in `supabase/migrations`.

### Prototype mode (no database)

- Without those settings, data is stored in the browser (localStorage). Open the scorer and public view in
  two tabs of the same browser to see live updates.
- Sign in (top right) with any mobile number, email or username; there is no verification. Sign-in is per
  browser tab, so open the scorer screen in two tabs as two people to try the take-over pop-up. The creator
  of a match is its organiser.

## Code map

| Path | Purpose |
|---|---|
| `src/lib/rally/engine.ts` | Replays the point log into sets, winner, set/match point |
| `src/lib/rally/mutations.ts` | Add point, undo, close, re-open, post-close edits (pure functions) |
| `src/lib/rally/commentary.ts` | Commentary generation from the point log |
| `src/lib/rally/rules.ts` | Rule validation and descriptions |
| `src/lib/rally/sports.ts` | Sport configurations: rules and default shot types |
| `src/lib/tournament/engine.ts` | Round-robin, seeded brackets, groups, points tables, advancement |
| `src/lib/tournament/mutations.ts` | Tournament setup, fixture generation, knockout start, sync with results |
| `src/app/tournaments/[id]` | Tournament page: entries, groups / table, fixtures, bracket |
| `src/lib/tournament/rounds.ts` | Extra rounds and fixture editing |
| `src/lib/tournament/schedule.ts` | Auto-scheduler, schedule import, bulk entries |
| `src/lib/tie/tie.ts` | Team ties: line-ups, match creation, tie score and winner |
| `src/app/ties/[id]` | Tie page: team score, matches, line-up picker |
| `src/lib/identity.ts` | Mobile / email / username parsing and normalisation |
| `src/lib/store.ts` | Storage: Supabase (live, versioned writes) or browser storage in prototype mode |
| `src/lib/remote.ts` | Supabase client, document reads/writes, live updates |
| `supabase/migrations` | Database table, live updates and permission rules |
| `src/app/matches/[id]/score` | Scorer screen |
| `src/app/matches/[id]` | Public match view |
| `src/app/matches/[id]/edit` | Organiser correction of closed matches |
| `src/app/matches/[id]/settings` | Shot types and detail toggles |
