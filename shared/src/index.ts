/**
 * @vault/shared — pure business logic and types shared by /functions and /web.
 *
 * This package must never import Firebase. Everything here is pure TypeScript
 * so it can be unit-tested with Vitest and bundled into both consumers.
 */

/** Bumped by hand; the placeholder page renders it to prove the import chain works. */
export const SHARED_VERSION = '0.2.0';

export * from './types.js';
export * from './season.js';
export * from './odds.js';
export * from './units.js';
export * from './shares.js';
export * from './book.js';
export * from './bookholder.js';
export * from './oddsFeed.js';
export * from './lockTime.js';
