# Rally Scorer (prototype)

First prototype of the multi-sport event scoring platform described in [`docs/SPEC.md`](docs/SPEC.md).
It covers the **rally family**: Badminton, Table Tennis and Volleyball.

## What it does

- **Tournaments** (CricHeroes-style): league, seeded knockout, or groups → knockout. Add entries and seeds,
  create groups and assign entries manually or automatically by seed, generate fixtures, follow points
  tables and the bracket; winners move on automatically and the champion is shown
- Create a single match (singles / doubles, or team for volleyball) with standard rules pre-filled and editable
- Scorer sets the rules before the start and can change them at any time during the match
  (e.g. shorter games because of weather); changes apply from the current set and are announced
- One active scorer at a time. Anyone with scoring access can request a take-over: the scorer gets 15
  seconds to allow or decline, and silence (e.g. a dead phone) passes scoring over automatically. The organiser takes over immediately without asking. Any scorer
  can give access to someone else by mobile number (with country code), email or username
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

### Prototype notes

- Data is stored in the browser (localStorage). Open the scorer and public view in two tabs of the
  same browser to see live updates. Supabase (shared data, realtime across devices, logins, scorer
  codes) replaces this in the next step; only `src/lib/store.ts` changes.
- Sign in (top right) with any mobile number, email or username; there is no verification yet. Sign-in is
  per browser tab, so open the scorer screen in two tabs as two people to try the take-over pop-up. The creator of a match is its organiser.

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
| `src/lib/identity.ts` | Mobile / email / username parsing and normalisation |
| `src/lib/store.ts` | Prototype storage (to be replaced by Supabase) |
| `src/app/matches/[id]/score` | Scorer screen |
| `src/app/matches/[id]` | Public match view |
| `src/app/matches/[id]/edit` | Organiser correction of closed matches |
| `src/app/matches/[id]/settings` | Shot types and detail toggles |
