# The Vault — Build Spec

A mobile-first web app for a private friend group's weekly NFL "Best Bet" pool. Players buy in each week, submit one pick, and one player (the Bookholder) wagers part of the shared Vault using that week's picks. The app is a **ledger and scoreboard only** — no money moves through it.

---

## 1. Rules (source of truth)

### 1.1 Weekly play
- A week is identified by its **NFL week number** (e.g. 4, 5, … 18), plus playoff rounds.
- The season in the app **starts at NFL Week 4**. Weeks 1–3 do not exist in the app.
- The first season starts from **zero**: an empty Vault, no shares, no picks, no standings, and share price $1.00. No historical or example data is imported.
- Buy-in is optional each week. No season-long commitment.
- Buy-in amounts:

| Week type | Buy-in |
|---|---|
| Regular season | $10 |
| Wild Card | $25 |
| Divisional | $25 |
| Conference Championships | $50 |
| Super Bowl | $100 |

- **Only players whose buy-in for that week is marked paid may submit a pick.**
- Each paying player submits exactly **one** Best Bet: a description of the pick plus its American odds.
- Picks lock at **11:00 AM America/New_York on Sunday** of that NFL week. Only games starting after 11:00 AM ET are eligible. Eligibility is on the honor system in v1; the text of the pick is free-form.
- Picks are hidden from other players until the week locks.

### 1.2 Grading and units (The Sharp)
- Every pick from a paying player is graded **win / loss / push** by the Admin. This applies whether or not the Book used the pick.
- Units are a flat 1-unit risk per pick:
  - Win, negative odds: `100 / |odds|` (e.g. −112 → +0.89u)
  - Win, positive odds: `odds / 100` (e.g. +170 → +1.70u)
  - Loss: `−1.00`
  - Push: `0`
- Records display as **W-L-P**. A push counts as neither a win nor a loss.
- **The Sharp** is the player with the most cumulative units through the Super Bowl. They receive **10% of the final Vault**.

### 1.3 The Book
- Each week has one **Bookholder**.
- The Admin is the Bookholder for the first week (NFL Week 4).
- After picks lock, the Bookholder may wager up to **25% of that week's Opening Vault** in total.
  - Bets may use **only that week's submitted picks**, in any combination: straight bets or parlays of any size.
  - The Bookholder may include their own pick.
  - The Bookholder may split the allowance across multiple bets. The **sum of all stakes** must be ≤ 25% of the Opening Vault.
- The app **records** the actual ticket odds and stake entered by the Bookholder. It does **not** compute parlay odds.
  - Default payout on a win is `stake × decimal(ticketOdds)`.
  - The Bookholder or Admin may override the payout with the exact amount from the ticket.
- Settlement of a book bet:
  - **Win:** the Vault receives payout minus stake as net profit.
  - **Loss:** the Vault loses the stake.
  - **Push/void:** the Vault is unchanged.

### 1.4 Earning next week's Book
Evaluated when a week closes. The first rule that applies wins:
1. If any pick **won**, the Book goes to the longest-odds winning pick.
2. If there were no wins but at least one pick **pushed**, the Book goes to the longest-odds push.
3. If every pick **lost**, the current Bookholder **keeps** the Book.

"Longest odds" means the highest decimal odds (`+odds/100 + 1`, or `100/|odds| + 1`).

Ties at step 1 or 2 are broken in this order:
1. Most cumulative season units, including this week's results.
2. Most weeks bought in this season.
3. A **coin flip**, done server-side with a random draw. The candidates and the result are written to the week doc so everyone can see how the Book was decided.

The Admin can manually override the Bookholder. Every override is logged.

### 1.5 The Vault and shares
- The Vault is a pooled balance. It is tracked with shares so that players who join in different weeks are treated fairly.
- The share price starts at **$1.00** in the first week.
- When a buy-in is marked paid, the player receives `shares = amount / sharePrice`. The share price used is **the closing share price of the previous closed week**, or $1.00 for the first week.
- `Opening Vault (week N)` = `Closing Vault (week N−1)` + all buy-ins for week N.
- `Closing Vault` = `Opening Vault` + net Book result.
- `Share price` = `Closing Vault / total shares outstanding`.
- A player's current stake value is `their shares × current share price`.
- Shares persist all season. A player who skips a week keeps their shares.

### 1.6 End of season
- After the Super Bowl week closes, the Admin runs **Finalize Season**:
  - The Sharp (the unit leader) is credited 10% of the final Vault.
  - The remaining 90% is the Group Vault. The app shows each player's share-based portion: `their shares / total shares × 90%`.
  - The group decides offline whether to cash out or spend it on an outing. The app only reports the numbers.

### 1.7 Money
- The app never processes payments. The Admin marks buy-ins as paid after receiving money offline.
- Every money movement is recorded as a ledger entry.

---

## 2. Tech stack

- **Frontend:** React + TypeScript + Vite. Tailwind for styling. Installable PWA; the design is mobile-first.
- **Auth:** Firebase Auth using email link or Google sign-in. `admin: true` is a custom claim.
- **Database:** Cloud Firestore.
- **Backend logic:** Cloud Functions for Firebase, 2nd gen, written in TypeScript on Node 20.
  - All money math, share issuance, grading side effects and week transitions happen **server-side only**.
- **Scheduling:** a scheduled Cloud Function runs every 5 minutes and locks any `open` week whose `lockAt <= now`.
- **Billing:** deploying Cloud Functions requires the Blaze (pay-as-you-go) plan. Local development and testing run entirely in the Emulator Suite at no cost. Expected production usage is within the free allowances.
- **Hosting:** Firebase Hosting.
- **Notifications (Phase 3):** Firebase Cloud Messaging.
- **Testing:** Firebase Emulator Suite. Use Vitest for pure logic and rules-unit-testing for security rules.

### Conventions
- Store **money as integer cents**.
- Store shares as numbers rounded to 6 decimal places.
- Display share price to 2 decimals and units to 2 decimals.
- Store American odds as integers. Valid values are ≤ −100 or ≥ +100.
- All times are stored as Firestore Timestamps and displayed in America/New_York.
- Put pure business logic (units, decimal odds, tiebreak, share math) in a shared `/shared` package that both the functions and the frontend import. Unit-test it thoroughly.

---

## 3. Firestore data model

```
players/{uid}
  displayName: string
  email: string
  isAdmin: boolean           // mirrors custom claim, for UI only
  createdAt: Timestamp

seasons/{seasonId}            // e.g. "2026"
  name: string
  startWeek: number          // 4
  status: "active" | "finalized"
  sharpPct: number           // 0.10
  bookCapPct: number         // 0.25
  currentWeekId: string
  totalShares: number        // maintained by functions
  vaultCents: number         // current vault balance, maintained by functions
  sharePrice: number         // latest closing share price

seasons/{seasonId}/weeks/{weekId}   // weekId e.g. "W04", "WC", "DIV", "CONF", "SB"
  nflWeek: number | null
  type: "regular" | "wildcard" | "divisional" | "conference" | "superbowl"
  order: number              // sort order within season
  buyInCents: number
  lockAt: Timestamp          // default Sunday 11:00 AM ET
  status: "open" | "locked" | "grading" | "closed"
  bookholderId: string
  sharePriceAtOpen: number   // price used for this week's buy-ins
  openingVaultCents: number  // set at lock (prev close + buy-ins)
  bookCapCents: number       // floor(openingVault * 0.25), set at lock
  bookNetCents: number       // set at close
  closingVaultCents: number  // set at close
  closingSharePrice: number  // set at close
  totalSharesAtClose: number
  nextBookholderId: string   // set at close
  bookDecision: {            // audit trail, set at close
    rule: "win" | "push" | "all_losses_keep" | "admin_override"
    candidates: string[]
    tiebreakUsed: "none" | "units" | "weeks" | "coin_flip"
    coinFlipResult?: string
  }
  closedAt: Timestamp

seasons/{seasonId}/weeks/{weekId}/buyIns/{uid}
  amountCents: number
  paid: boolean
  paidAt: Timestamp
  sharePrice: number
  sharesIssued: number
  markedBy: string

seasons/{seasonId}/weeks/{weekId}/picks/{uid}   // doc id = uid → one pick per player per week
  playerId: string
  pickText: string           // "Bears -2.5"
  gameText: string           // "CHI vs CAR"
  americanOdds: number
  submittedAt: Timestamp
  updatedAt: Timestamp
  result: "pending" | "win" | "loss" | "push"
  units: number | null       // set at grading

seasons/{seasonId}/weeks/{weekId}/bookBets/{betId}
  legPickIds: string[]       // uids of pick docs used
  stakeCents: number
  ticketOdds: number         // American odds from actual ticket
  payoutCents: number | null // total return if win; default stake*decimal(ticketOdds), overridable
  result: "pending" | "win" | "loss" | "push"
  netCents: number | null    // +profit / −stake / 0
  placedBy: string
  placedAt: Timestamp

seasons/{seasonId}/ledger/{entryId}
  type: "buy_in" | "book_net" | "sharp_award" | "final_distribution" | "adjustment"
  weekId: string | null
  playerId: string | null
  amountCents: number        // signed
  note: string
  createdAt: Timestamp
  createdBy: string

seasons/{seasonId}/standings/{uid}   // maintained by functions; read-only to clients
  playerId: string
  displayName: string
  wins: number
  losses: number
  pushes: number
  units: number
  weeksBoughtIn: number
  shares: number
```

---

## 4. Week lifecycle

```
open ──(lockAt reached)──▶ locked ──(admin starts grading)──▶ grading ──(admin closes)──▶ closed
```

- **open**
  - The Admin marks buy-ins paid.
  - Paid players submit or edit their pick.
  - Players can see only their own pick.
- **locked**
  - Pick edits are rejected.
  - All picks become visible to all signed-in players.
  - `openingVaultCents` and `bookCapCents` are snapshotted.
  - The Bookholder can place book bets. Buy-ins can no longer be marked paid for this week.
- **grading**
  - The Admin sets results on picks and book bets.
  - The Bookholder can no longer add bets.
- **closed**
  - Set by `closeWeek`, which fails unless every pick and book bet has a result.
  - Everything is immutable except through an Admin `adjustment` ledger entry.

The Admin creates the next week. By default this happens automatically at close, with the type, buy-in amount and default `lockAt` pre-filled and editable.

---

## 5. Cloud Functions

All functions are callable (HTTPS onCall) unless noted. Each function checks auth and role before doing anything.

| Function | Who | Does |
|---|---|---|
| `createSeason` | Admin | Creates the season and the first week (W04), sets the Admin as Bookholder, sets share price to 1.00 |
| `createWeek` | Admin | Creates the next week with type, buy-in and lockAt; sets `sharePriceAtOpen` = season `sharePrice` |
| `markBuyInPaid` | Admin | In a transaction, validates the week is `open` and the player is not already paid, issues `shares = amountCents/100 / sharePriceAtOpen`, increments season `totalShares`, `vaultCents` and the player's standings `shares` and `weeksBoughtIn`, and writes a `buy_in` ledger entry |
| `unmarkBuyIn` | Admin | Reverses the above while the week is `open`; also deletes the player's pick |
| `submitPick` | Player | Validates the week is `open`, the buy-in is paid, now < lockAt, and the odds are valid; upserts `picks/{uid}` |
| `adminSubmitPick` | Admin | Enters or edits a pick on a paid player's behalf. Allowed in any status except `closed`, so picks collected offline (e.g. in the group chat) can be entered after lock. Records `enteredBy` on the pick doc |
| `lockDueWeeks` | Scheduled (every 5 min) | For weeks with `status=open` and `lockAt<=now`, sets `locked`, `openingVaultCents` = season `vaultCents`, and `bookCapCents = floor(opening × 0.25)` |
| `placeBookBet` | Bookholder | Validates the week is `locked`, every leg is a pick in this week, stake > 0, and the sum of stakes ≤ `bookCapCents`; records the ticket odds and default payout |
| `updateBookBet` / `deleteBookBet` | Bookholder or Admin | Allowed only while the week is `locked` |
| `startGrading` | Admin | `locked` → `grading` |
| `gradePick` | Admin | Sets the result and computes `units` |
| `gradeBookBet` | Admin | Sets the result, optionally overrides payout, and computes `netCents` |
| `closeWeek` | Admin | See below |
| `overrideBookholder` | Admin | Sets the next or current Bookholder and writes a `bookDecision` with `admin_override` |
| `finalizeSeason` | Admin | After the SB week closes, computes the Sharp (units leader; tie → surfaced to Admin to resolve), writes the `sharp_award` entry, computes each player's 90% share-based portion, and sets season `finalized` |

### `closeWeek` (single transaction)
1. Assert the week is `grading` and every pick and book bet has a non-pending result.
2. `bookNetCents` = sum of the book bets' `netCents`. Write a `book_net` ledger entry.
3. `closingVaultCents = openingVaultCents + bookNetCents`. Update season `vaultCents`.
4. `closingSharePrice = closingVaultCents / 100 / totalShares`. Update season `sharePrice`.
5. For each pick, update the player's standings: W/L/P and `units`.
6. Determine `nextBookholderId` per §1.4, using the **updated** standings for the units tiebreak. Write `bookDecision`.
7. Set status `closed`.
8. Unless this is the SB week, create the next week with `bookholderId = nextBookholderId`.

---

## 6. Security rules (summary)

- Clients may **never** write:
  - `buyIns`
  - `ledger`
  - `standings`
  - `bookBets`
  - season or week money fields
  - pick `result` / `units`

  Those all go through functions.
- `players/{uid}`: a user reads any player and writes only their own `displayName`.
- `picks/{uid}`: readable if `request.auth.uid == uid`, OR the parent week's status is not `open` (checked with `get()` on the week doc), OR the user is admin. Client writes are denied because `submitPick` handles them.
- `bookBets`: readable by all signed-in players once the week is `locked`.
- Everything else is readable by any signed-in player.
- Membership: only invited emails can sign in. Keep an `invites/{email}` collection that the Admin manages; a `beforeUserCreated` blocking function rejects anyone else.

---

## 7. Screens

1. **Home / Dashboard**
   - Vault balance, share price and the change from last week.
   - Your shares and their current value.
   - Current week: status, lock countdown, Bookholder, your buy-in status, your pick.
2. **Submit Pick**
   - Fields: game, pick text and American odds, with live display of implied units if it wins.
   - Disabled with an explanation if you're not paid or the week is locked.
3. **Week Card**
   - All picks with owner, pick, odds and result badge, plus the week record (e.g. 3-5-0).
   - Before lock it shows only who has submitted, not what they picked.
4. **Sharp Standings**
   - Rank, player, W-L-P, units (green/red) and weeks bought in.
   - Top 3 get medals.
5. **The Book** (the Bookholder can act; everyone can view)
   - Cap remaining.
   - Bet builder: select legs from this week's picks, then enter stake, ticket odds and an optional exact payout.
   - A list of placed bets and their results.
6. **Earned the Book**
   - Next Bookholder and why: the winning pick, the tiebreak used, and the coin flip if one happened.
7. **Ledger / History**
   - Past weeks with opening/closing Vault, Book result and share price.
   - A simple Vault-over-time line chart.
8. **Admin**
   - Invite players, create and edit weeks, mark buy-ins paid, grade picks and book bets, close week, override Bookholder, finalize season.
9. **Weekly Recap Card** (Phase 2)
   - A shareable image summarizing the closed week:
     - Vault numbers.
     - Book result and potential payout.
     - Card results.
     - Sharp standings.
     - Next Bookholder.
   - Render it client-side from a React component with `html-to-image`, then share it through the Web Share API or download it.

Visual direction: dark green and black with gold accents. The reference infographics are inspiration only; the layout does not need to match them.

---

## 8. Build phases

### Phase 1 — MVP (target: usable for NFL Week 4)
- Firebase project setup, emulators, invites-only auth, admin claim.
- Season and week creation, buy-ins with share issuance, pick submission, auto-lock.
- Week Card, Sharp Standings, Dashboard.
- Admin grading and `closeWeek`, including the Book-earning logic and tiebreaks.
- Book bets recorded by Admin or Bookholder with the cap enforced (a basic form is fine).
- Security rules and tests.

### Phase 2 — Polish
- Full Book builder UI with leg selection.
- Earned-the-Book screen with the decision audit.
- Ledger/history page and Vault chart.
- Weekly Recap Card image.
- Playoff week types.

### Phase 3 — Extras
- FCM push notifications for reminders before lock, "picks are locked", "the Book is set" and "week closed".
- `finalizeSeason` UI and the end-of-season payout table.
- Optional: odds lookup and auto-grading of spreads and totals using an odds API. Props stay manually graded.

---

## 9. Test fixtures (must pass)

### 9.1 Reference week (test-only fixture)
This fixture is based on an example week from a **different group**. Its only use is to verify the math. It must **never** be seeded into the production Firestore or appear in any real season, Vault, Sharp standings or history. Load it only in emulator/unit tests. The real season starts from zero at NFL Week 4 (see §1.1 and §8).

Setup: 8 test players (P1–P8) each buy in $10 at share price $1.00. Bookholder: P2.

| Player | Pick | Odds | Result | Units |
|---|---|---|---|---|
| P1 | Bears −2.5 | −138 | win | +0.72 |
| P2 | DET vs NO Over 49.5 | −112 | win | +0.89 |
| P3 | Jameson Williams Anytime TD | +170 | loss | −1.00 |
| P4 | WAS vs PHI Under 44.5 | −115 | loss | −1.00 |
| P5 | Dallas −3 | −112 | loss | −1.00 |
| P6 | Chris Olave 6+ Receptions | −174 | win | +0.57 |
| P7 | CHI vs CAR Under 47.5 | −110 | loss | −1.00 |
| P8 | Emeka Egbuka Anytime TD | +180 | loss | −1.00 |

Book: one 8-leg parlay, stake $20, ticket odds +18054, result loss.

Expected results:
- Opening Vault $80.00, Book cap $20.00, Book net −$20.00.
- Closing Vault $60.00, total shares 80, share price $0.75.
- Week record 3-5-0.
- Default payout if it had won: $3,630.80. A ticket-override payout of $3,630.82 must be accepted and used.
- Next Bookholder: **P2**. The winners are −138, −112 and −174; −112 has the longest odds.
- If P5 buys in $10 the following week: 13.333333 shares issued at $0.75.

### 9.2 Book-earning edge cases
- No wins and one push → the push owner gets the Book.
- No wins and two pushes at +150 and −110 → the +150 push gets the Book.
- All losses → the current Bookholder keeps the Book.
- Two winners at the same odds → the one with more season units wins. If units are equal, the one with more weeks bought in wins. If that's also equal, a coin flip is recorded in `bookDecision`.
- The Bookholder's own pick is eligible to win the next Book.

### 9.3 Guards
- Unpaid player `submitPick` → rejected.
- `submitPick` after lockAt → rejected.
- `placeBookBet` whose total stakes exceed the cap by 1 cent → rejected.
- `placeBookBet` with a leg from another week → rejected.
- `closeWeek` with any pending result → rejected.
- A non-admin reading another player's pick while the week is `open` → denied by rules.

---

## 10. Open items (not blocking Phase 1)
- **Sharp tie at season end:** split the 10%, or apply the same tiebreak chain? For now `finalizeSeason` surfaces a tie to the Admin.
- **Late buy-ins:** can a buy-in be marked paid after lock? Current rule: no.
