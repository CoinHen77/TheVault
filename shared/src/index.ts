/**
 * @vault/shared — pure business logic and types shared by /functions and /web.
 *
 * This package must never import Firebase. Everything here is pure TypeScript
 * so it can be unit-tested with Vitest and bundled into both consumers.
 *
 * Milestone 2 fills this in: types for every Firestore doc (SPEC.md §3) plus
 * americanToDecimal, unitsForPick, sharesForBuyIn, sharePrice, bookCapCents,
 * bookBetNetCents and decideNextBookholder.
 */

/** Bumped by hand; the placeholder page renders it to prove the import chain works. */
export const SHARED_VERSION = '0.1.0';
