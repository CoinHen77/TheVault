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
}
