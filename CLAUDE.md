# CLAUDE.md — The Vault

## What this project is
The Vault is a mobile-first web app for a private friend group's weekly NFL "Best Bet" pool. The flow each week:
1. Players buy in.
2. Each player submits one pick.
3. A Bookholder wagers part of the shared Vault using those picks.
4. Picks are tracked all season for the "Sharp" standings.

The app is a **ledger and scoreboard only**. No money moves through it.

**`SPEC.md` is the source of truth.** Read it fully at the start of every session before doing any work. If this file and SPEC.md ever disagree, SPEC.md wins, and you should tell the user about the conflict.

The owner (Zach) is the Admin and the only developer. He builds with Claude Code and reviews each milestone before moving on.

---

## How to work in this repo

- **Work one milestone at a time** (see below).
  - At the start of a session, check the milestone checklist in this file to see what's done.
  - Do only the next unchecked milestone unless Zach says otherwise.
  - Stop when its "Done when" criteria pass.
- **At the end of each milestone:**
  1. Run all tests and show the results.
  2. Summarize what was built and any decisions you made that SPEC.md didn't cover.
  3. Tick the milestone's checkbox in this file.
  4. Suggest a commit message. Don't commit unless asked.
- **Ask before you:**
  - Change a business rule.
  - Add a paid service or a major dependency.
  - Deviate from the data model in SPEC.md §3.
- If SPEC.md is ambiguous, pick the simplest reading, note it in your milestone summary, and keep going.
- Keep solutions simple. This app has fewer than 20 users.

---

## Non-negotiable conventions

- **Money is integer cents** everywhere in storage and logic. Only format to dollars in the UI.
- Shares are numbers rounded to 6 decimals. Share price and units display to 2 decimals.
- American odds are integers. Valid values are ≤ −100 or ≥ +100.
- **All money math, share issuance, grading side effects and week transitions run server-side** in Cloud Functions. Clients never write money fields, results, units, standings, ledger entries, buy-ins or book bets.
- Pure business logic lives in `/shared` and is imported by both the functions and the frontend:
  - units
  - decimal odds
  - share math
  - Book cap
  - bet net
  - the Book-earning decision and its tiebreaks
- `/shared` has no Firebase imports.
- All times are stored as Firestore Timestamps and displayed in `America/New_York`.
- Multi-document money updates (`markBuyInPaid`, `unmarkBuyIn`, `closeWeek`) use Firestore transactions.
- The app does **not** compute parlay odds. Ticket odds are entered by the user.
- TypeScript strict mode everywhere.

## Data rules

- The real season **starts from zero at NFL Week 4 of the 2026 season**, with the Admin as the first Bookholder.
- **Test fixture §9.1 in SPEC.md comes from a different group.** It is test-only data:
  - Use it only in unit and emulator tests.
  - Never seed it, import it or reference it anywhere in production code, seed scripts or the real Firestore.
- Emulator seed scripts use obviously fake users (e.g. `test1@example.com`).

---

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind. Installable PWA; the design is mobile-first.
- **Backend:** Cloud Functions for Firebase (2nd gen, TypeScript, Node 20), Firestore, Firebase Auth (Google + email link), Firebase Hosting.
- **Tests:** Vitest for `/shared`, the Firebase Emulator Suite for functions, and `@firebase/rules-unit-testing` for security rules.
- **Environment:** all development and testing happens against the emulators. Deploying is done only in Milestone 7, when Zach asks.

## Suggested layout (confirm or adjust in Milestone 1)

```
/shared        pure logic + types + tests
/functions     Cloud Functions
/web           React app
/firestore.rules
/firestore.indexes.json
/firebase.json
/scripts       emulator seed scripts (fake data only)
SPEC.md
CLAUDE.md
```

---

## Milestones (Phase 1)

### [x] 1. Plan & scaffold
- Propose the final repo layout and confirm it with Zach.
- Scaffold `/web`, `/functions` and `/shared`, with workspaces or another way for `/shared` to be imported by both.
- Configure `firebase.json` and `.firebaserc`, including the Auth, Firestore, Functions and Hosting emulators. Ask Zach for the Firebase project ID.
- Add npm scripts: `dev`, `emulators`, `test`, `test:rules`, `seed`.
- **Done when:** `npm run emulators` starts cleanly and the web app loads a placeholder page connected to the emulators.

### [x] 2. Core logic in `/shared`
- Build the types for every Firestore doc in SPEC.md §3.
- Implement these functions:
  - `americanToDecimal`
  - `unitsForPick`
  - `sharesForBuyIn`
  - `sharePrice`
  - `bookCapCents`
  - `bookBetNetCents` (with a default payout and optional override)
  - `decideNextBookholder` (SPEC.md §1.4, including the win → push → keep rules and the tiebreak chain units → weeks → coin flip, with the coin flip random source injectable for tests)
- **Done when:** Vitest covers every case in SPEC.md §9.1 and §9.2, and all tests pass.

### [x] 3. Cloud Functions
- Implement every function in SPEC.md §5, including `adminSubmitPick` and `lockDueWeeks`, using `/shared`.
- Enforce auth and role checks: Admin via custom claim, Bookholder via the week doc.
- Every money change writes a ledger entry.
- **Done when:** emulator tests do all of the following:
  - Run a full week end to end with the §9.1 fixture and get the expected numbers ($60 closing Vault, $0.75 share price, Bookholder P2).
  - Pass every guard in §9.3.
  - Show a second week's buy-in issuing 13.333333 shares at $0.75.

### [x] 4. Security rules & auth gate
- Write `firestore.rules` per SPEC.md §6.
- Add the `invites/{email}` collection and a `beforeUserCreated` blocking function that rejects anyone not invited.
- Add a script to set the Admin custom claim.
- **Done when:** rules tests prove all of the following:
  - Other players' picks are hidden while the week is `open` and visible after lock.
  - Clients cannot write any protected field.
  - Non-invited users are rejected.

### [x] 5. Frontend — player screens
- Sign-in.
- **Dashboard:** Vault, share price, my shares and their value, current week status, lock countdown, Bookholder, my buy-in and my pick.
- **Submit Pick:** implied units shown live; the form is disabled with a reason when you're unpaid or the week is locked.
- **Week Card:** before lock it shows only who has submitted; after lock it shows everything.
- **Sharp Standings.**
- **Book view:** everyone can see it. The Bookholder can add bets through a basic form with legs selected from this week's picks, stake, ticket odds and an optional payout override. Show the cap remaining.
- **Styling:** dark green/black with gold accents, mobile-first.
- **Done when:** a seeded emulator week can be played through the UI as several fake users.

### [x] 6. Frontend — Admin screens
- Invite players.
- Create a season (start week 4, Admin as Bookholder) and create or edit weeks.
- Mark buy-ins paid or unpaid.
- Enter a pick on a player's behalf.
- Start grading, grade picks and book bets, close the week (showing the Book decision and its reason), and override the Bookholder.
- **Done when:** Zach can run a full week as Admin in the emulators from season creation through close.

### [x] 7. Deploy (only when Zach asks)
- Deploy the rules, indexes, functions and hosting.
- Walk Zach through:
  1. Setting his Admin claim.
  2. Adding invites.
  3. Creating the real 2026 season starting at Week 4, with an empty Vault and a $1.00 share price.
- Confirm that no test or fixture data exists in production.

---

## Later phases (don't start without being asked)
- **Phase 2:** full Book builder UI, Earned-the-Book screen, ledger/history with Vault chart, Weekly Recap image card, playoff weeks.
- **Phase 3:** push notifications, Finalize Season UI, optional odds API and auto-grading.

See SPEC.md §8 for details.
