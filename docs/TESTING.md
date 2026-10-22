# Testing the live app

Site: <https://club-management-flax.vercel.app> (the badge next to "Rally Scorer" must read **● live**).

Use two devices (or one phone plus a private browser window), signed in as two different people:
**Organiser** (your email) and **Scorer** (a second email or mobile number). Tick each line as it works;
note anything odd with the page and what you tapped.

## 1. Sign-in
- [ ] Sign in → enter email → code arrives → signed in; the header shows your email
- [ ] Sign out and in again on the same phone: a new code is sent
- [ ] A wrong code shows an error, not a crash

## 2. Single match
- [ ] **+ Single match** → badminton singles; the rules show **Best of 3 games to 21** selected
- [ ] Add the Scorer under scoring access (by email / mobile)
- [ ] Toss: flip the coin, pick serve / side → **Start match**
- [ ] Score points; serve indicator moves; at 11 a **60 s interval** reminder shows
- [ ] **Undo** removes the last point
- [ ] The second device (public view) updates within about a second
- [ ] Scorer device: **Request to take over** → Organiser allows (or waits 15 s) → Scorer now scores
- [ ] Finish the match → **Close match** → result shown on the home page as a score card
- [ ] Organiser: **Edit points** on the closed match works; Scorer can't edit after close

## 3. Volleyball
- [ ] Indoor best of 3: at 1–1 sets, the **new toss for the deciding set** card appears before play continues
- [ ] Beach preset: ends change every 7 points (5 in the third set)

## 4. Team tie
- [ ] **+ Team tie** → table tennis → format **Swaythling** → two teams of 3
- [ ] On the tie page: give letters A, B, C and X, Y, Z → the five singles fill in
- [ ] Play matches until one team has 3 wins → remaining matches show **Not needed**

## 5. Tournament
- [ ] **+ New tournament** → pick a **template** (e.g. Championship) → the "You'll get" line makes sense
- [ ] Add 8 entries (paste a list), give 2 seeds; the seeding tip appears
- [ ] Groups → auto-assign by seed → **Generate fixtures**
- [ ] Schedule tab → auto-schedule; times and courts appear on matches
- [ ] Play the group matches; the table follows the **Official BWF / ITTF / FIVB** order shown under it
- [ ] Record one **walkover**: the table treats it per the sport (BWF deletes that player's group results)
- [ ] **Start knockout** → bracket → finish to a champion; optional third-place match

## 6. Player cards
- [ ] **Players → + New card**: name + the Scorer's email → card created (others see only a masked hint)
- [ ] In a new match, tap **+ Card** next to a player and pick the card (shows **✓ Card**)
- [ ] After the match closes, the card shows Played / Won / Form and the match under Results
- [ ] Scorer signs in → **🪪 My card** shows that card as theirs → **Edit card** works
- [ ] A third person can view the card but has no **Edit card** button

## 7. General
- [ ] Every page works on the phone without sideways scrolling
- [ ] Turning the phone's internet off and on: the scorer screen recovers and the score is saved
- [ ] Refreshing any page keeps the data
