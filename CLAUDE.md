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

## Phase 1.5 — Heist redesign

A frontend-only restyle of `/web` in the "Heist" look: vault door artwork, sealed tickets, envelopes and a lock-time reveal.
- The mockups are the visual reference: https://claude.ai/artifact/BZ3JKnAdAafhcQuo9KxRbd
- No business rules, data model (SPEC.md §3), Cloud Functions or security rules change. Everything shown is derived from existing data.
- Target platforms: web browsers on phones, tablets and desktop, plus an installable PWA.

Decisions already made:
- **Wording:** use the full Heist wording, but in UI copy only. Data field names such as `bookholderId` stay the same. The terms are:
  - "key holder" = Bookholder
  - "The Code" = Rules
  - "Control room" = Admin
  - "Seal it" = submit pick
  - "envelopes" = hidden picks
  - "crew" = players
- **Layout:** tablets and desktop (≥768px) use two columns. Phones use one column.
- **Artwork:** the steel-and-brass vault door is cleared for use and needs no credit line. It comes in three states: closed, opening and open.
- **Starting point:** keep the early design edits already in `/web`: fonts, number styling, `Icon.tsx` and the five-tab nav. Build on them.

### [x] H0. Housekeeping
- Commit Zach's in-progress work (preload, Rules, delete season, buy-in defaults) together with the early design edits, as the redesign's starting point.
- Local dev must run against the emulators (`VITE_USE_EMULATORS=true`). `web/.env.local` currently points dev at production.
- **Done when:** the working tree is clean and the redesign starts from a known commit.

### [x] H1. Foundation
- Add steel tones to the theme tokens, alongside the existing green, black and gold.
- Fonts: Playfair Display (display), Inter (body), JetBrains Mono (all money, odds and units).
- Door artwork goes in `web/public/vault/` as closed, opening and open WebP files at 1x and 2x. Preload the closed door.
- Build these components:
  - `Ticket` (with notches and a torn-edge line)
  - `WaxSeal`
  - `ResultStamp`
  - `Envelope`
  - `DoorDial` (door plus countdown ring)
  - `Avatar`
  - `KeyBadge`
  - `CapRing`
  - `Podium`
- All Heist wording lives in `web/src/lib/copy.ts`.
- **Done when:** a scratch page renders every component in each of its states, and typecheck passes.

### [x] H2. Responsive shell
- **Phones (<768px):** one column, the five-tab bottom bar (Home, Pick, Week, Sharp, Book), and Rules and Admin as header icons. Every tap target is at least 44px. Respect safe-area insets.
- **≥768px:** the bottom bar becomes a left-hand menu that also lists Rules and Admin: an 80px icon strip on tablets (768–1023px) so two columns fit, and the full labelled menu from 1024px.
- **Two-column layouts:**
  - Home: door and Vault on the left; ticket and week on the right.
  - Week: envelopes in 4 columns.
  - Admin: grading beside buy-ins.
- **Done when:** every screen works at 375, 768 and 1280px wide with no horizontal scroll.

### [x] H3. Player screens
- **Sign-in:** large closed door.
- **Home**, in three states:
  - **Open:** the door inside the countdown ring, a sealed ticket, the envelope count and the key holder.
  - **Locked or grading:** the open door, and the ticket stamped with its result. Show "Used in the Book" when the pick is in a book bet's legs.
  - **After close:** a "last week" card from the most recent closed week. Show "You hold the key" when the player is the new Bookholder.
  - All states show season record and rank from standings.
- **Pick:** a live ticket preview showing units won or lost, and a "Seal it" button (the pick can be resealed until lock).
- **Week:**
  - Before lock: envelopes, with "?" for players still waiting.
  - After lock: every ticket with its stamp, the W-L-P record, and who gets the key and why (from `bookDecision`).
- **Sharp:** a podium for the top 3, then a list.
- **Book:** a cap ring, placed bets as tickets, and pick chips for building a bet.
- **Rules:** "The Code", five steps.
- **Done when:** a seeded emulator week can be played through the UI as several fake users.

### [x] H4. The lock moment
- The door animates closed → opening → open, then the envelopes flip open to reveal the tickets.
- It plays once per week per device: on the first visit after lock, or live if the app is open at lock. A localStorage "seen" flag tracks this.
- With `prefers-reduced-motion`, skip the animation and show the open door.
- **Done when:** it plays exactly once per week per device and never blocks using the app.

### [x] H5. Admin "Control room"
- Add a lifecycle stepper (Open → Locked → Grading → Closed) with the next action as the primary button.
- One-tap W/L/P grading.
- Move invites, the key override and seasons (create, delete, preload) into a secondary area.
- Restyle only: no function changes.
- **Done when:** Zach can run a full week as Admin, from season creation through close.

### [ ] H6. Installable app
- Add a web app manifest: name, dark theme color, standalone display, and icons at 192, 512 and maskable, made from the closed door. Add the Apple touch icon and the iOS standalone meta tags.
- No offline service worker for now.
- Point Firebase `authDomain` at the `web.app` domain so sign-in works in installed iOS apps.
- In installed iOS apps, Google sign-in is the main path, because email links open in Safari instead of the app.
- **Done when:** the app installs and signs in on an iPhone, an Android phone and an iPad, and still works in a normal browser tab.

### [ ] H7. QA & launch (deploy only when Zach asks)
- Run all tests; they should pass unchanged.
- Test manually on iPhone Safari and as an installed app, Android Chrome and as an installed app, iPad, and desktop Chrome and Safari.
- On one phone with "Reduce motion" turned on, confirm the lock moment shows no animation (the in-app browser can't emulate this setting, so H4 couldn't test it).
- Set long cache headers for images and fonts in `firebase.json`.
- Deploy hosting only: `firebase deploy --only hosting`.

---

## Later phases (don't start without being asked)
- **Phase 2:** full Book builder UI, Earned-the-Book screen, ledger/history with Vault chart, Weekly Recap image card, playoff weeks.
- **Phase 3:** push notifications, Finalize Season UI, optional odds API and auto-grading.

See SPEC.md §8 for details.
