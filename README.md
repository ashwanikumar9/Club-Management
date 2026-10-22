# Rally Scorer (prototype)

First prototype of the multi-sport event scoring platform described in [`docs/SPEC.md`](docs/SPEC.md).
It covers the **rally family**: Badminton, Table Tennis and Volleyball.

## What it does

- Create a match (singles / doubles / team) with standard rules pre-filled and editable
- Scorer sets the rules before the start and can change them at any time during the match
  (e.g. shorter games because of weather); changes apply from the current set and are announced
- One active scorer at a time; anyone with scoring access can take over (e.g. when a phone dies) or be
  handed control, and any scorer can give access to someone else by mobile number, email or username
- Point-by-point scoring with big `+1` buttons
- Optional "how" (shot type) and "who" (player / jersey) prompts after each point, switchable mid-match
- Auto-generated live commentary, game/set point, match point and result lines
- **Undo** available for the whole match until it is closed
- After close, only the organiser can edit, insert or delete points (with a change log) or re-open
- Public match view with live score, set breakdown, commentary and optional livestream link
- Editable shot-type catalogue and commentary lines per match

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # scoring engine tests
```

To try it on a phone on the same Wi-Fi: `npm run dev -- -H 0.0.0.0` and open `http://<computer-ip>:3000`.

### Prototype notes

- Data is stored in the browser (localStorage). Open the scorer and public view in two tabs of the
  same browser to see live updates. Supabase (shared data, realtime across devices, logins, scorer
  codes) replaces this in the next step; only `src/lib/store.ts` changes.
- Sign in (top right) with any mobile number, email or username; there is no verification yet. Switch
  person from the same menu to try a hand-over on one device. The creator of a match is its organiser.

## Code map

| Path | Purpose |
|---|---|
| `src/lib/rally/engine.ts` | Replays the point log into sets, winner, set/match point |
| `src/lib/rally/mutations.ts` | Add point, undo, close, re-open, post-close edits (pure functions) |
| `src/lib/rally/commentary.ts` | Commentary generation from the point log |
| `src/lib/rally/rules.ts` | Rule validation and descriptions |
| `src/lib/rally/sports.ts` | Sport configurations: rules and default shot types |
| `src/lib/identity.ts` | Mobile / email / username parsing and normalisation |
| `src/lib/store.ts` | Prototype storage (to be replaced by Supabase) |
| `src/app/matches/[id]/score` | Scorer screen |
| `src/app/matches/[id]` | Public match view |
| `src/app/matches/[id]/edit` | Organiser correction of closed matches |
| `src/app/matches/[id]/settings` | Shot types and detail toggles |
