/**
 * Types for every Firestore document in SPEC.md §3.
 *
 * These are structural types only — no Firebase imports. `TimestampLike`
 * matches the shape of both `firebase-admin`'s and the client SDK's
 * `Timestamp`, so functions and web can both pass their real Timestamp
 * instances through these types without /shared depending on Firebase.
 */

export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

export type WeekType =
  | 'regular'
  | 'wildcard'
  | 'divisional'
  | 'conference'
  | 'superbowl';

export type WeekStatus = 'open' | 'locked' | 'grading' | 'closed';

export type PickResult = 'pending' | 'win' | 'loss' | 'push';

export type BookDecisionRule = 'win' | 'push' | 'all_losses_keep' | 'admin_override';

export type BookDecisionTiebreak = 'none' | 'units' | 'weeks' | 'coin_flip';

export type LedgerEntryType =
  | 'buy_in'
  | 'preload'
  | 'book_net'
  | 'sharp_award'
  | 'final_distribution'
  | 'adjustment';

export type SeasonStatus = 'active' | 'finalized';

export interface BookDecision {
  rule: BookDecisionRule;
  candidates: string[];
  tiebreakUsed: BookDecisionTiebreak;
  coinFlipResult?: string;
}

/** players/{uid} */
export interface Player {
  displayName: string;
  email: string;
  isAdmin: boolean;
  createdAt: TimestampLike;
}

/**
 * invites/{email} — doc id is the lowercased invited email. SPEC.md §6:
 * an allowlist the Admin manages; `beforeUserCreated` rejects sign-up for
 * any email without a doc here.
 */
export interface Invite {
  invitedBy: string;
  invitedAt: TimestampLike;
  displayName?: string;
}

/** seasons/{seasonId} */
export interface Season {
  name: string;
  startWeek: number;
  status: SeasonStatus;
  sharpPct: number;
  bookCapPct: number;
  currentWeekId: string;
  totalShares: number;
  vaultCents: number;
  sharePrice: number;
  /** Per-week-type buy-in defaults used to pre-fill W04 and every auto-created week after it (editable per-week as today). */
  buyInDefaultsCents: Record<WeekType, number>;
  /** Minimum cumulative preload a player needs before markBuyInPaid will accept a weekly buy-in for them. 0 = no gate. */
  requiredPreloadCents: number;
}

/** seasons/{seasonId}/weeks/{weekId} */
export interface Week {
  nflWeek: number | null;
  type: WeekType;
  order: number;
  buyInCents: number;
  lockAt: TimestampLike;
  status: WeekStatus;
  bookholderId: string;
  /**
   * uids who have submitted a pick this week, with no pick content — lets the
   * Week Card show a submitted/not-submitted roster before lock, when the
   * `picks` subcollection itself is unreadable to non-admins (SPEC.md §7
   * screen 3 vs. §6 pick visibility). Maintained by submitPick,
   * adminSubmitPick and unmarkBuyIn.
   */
  submittedPlayerIds: string[];
  sharePriceAtOpen: number;
  openingVaultCents: number;
  bookCapCents: number;
  bookNetCents: number;
  closingVaultCents: number;
  closingSharePrice: number;
  totalSharesAtClose: number;
  nextBookholderId: string;
  bookDecision: BookDecision;
  closedAt: TimestampLike;
}

/** seasons/{seasonId}/weeks/{weekId}/buyIns/{uid} */
export interface BuyIn {
  amountCents: number;
  paid: boolean;
  paidAt: TimestampLike;
  sharePrice: number;
  sharesIssued: number;
  markedBy: string;
}

/**
 * seasons/{seasonId}/preloads/{uid} — a one-time, season-scoped deposit (not
 * tied to any week) required before a player's weekly buy-ins can be marked
 * paid, when Season.requiredPreloadCents > 0. Shape mirrors BuyIn.
 */
export interface Preload {
  amountCents: number;
  paid: boolean;
  paidAt: TimestampLike;
  sharePrice: number;
  sharesIssued: number;
  markedBy: string;
}

/** seasons/{seasonId}/weeks/{weekId}/picks/{uid} */
export interface Pick {
  playerId: string;
  pickText: string;
  gameText: string;
  americanOdds: number;
  submittedAt: TimestampLike;
  updatedAt: TimestampLike;
  result: PickResult;
  units: number | null;
  /** Set when the Admin enters this pick on the player's behalf (SPEC.md §5 adminSubmitPick). */
  enteredBy?: string;
}

/** seasons/{seasonId}/weeks/{weekId}/bookBets/{betId} */
export interface BookBet {
  legPickIds: string[];
  stakeCents: number;
  ticketOdds: number;
  payoutCents: number | null;
  result: PickResult;
  netCents: number | null;
  placedBy: string;
  placedAt: TimestampLike;
}

/** seasons/{seasonId}/ledger/{entryId} */
export interface LedgerEntry {
  type: LedgerEntryType;
  weekId: string | null;
  playerId: string | null;
  amountCents: number;
  note: string;
  createdAt: TimestampLike;
  createdBy: string;
}

/** seasons/{seasonId}/standings/{uid} */
export interface Standing {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  weeksBoughtIn: number;
  shares: number;
  /** Cumulative amount this player has preloaded this season, gating eligibility for markBuyInPaid against Season.requiredPreloadCents. */
  preloadedCents: number;
}
