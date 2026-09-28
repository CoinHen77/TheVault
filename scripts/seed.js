/**
 * Emulator seed script. Fake data only — never point this at production.
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * are set, which the Emulator Suite does for you. The SPEC.md §9.1 reference
 * week belongs to a different group and is test-only: it lives in the unit and
 * emulator tests, never here.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'the-vault-dev';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusing to seed: emulator host env vars are not set.');
  process.exit(1);
}

/** Obviously-fake players, per CLAUDE.md. Populated with data in Milestone 5. */
export const SEED_PLAYERS = [
  { email: 'test1@example.com', displayName: 'Test One', isAdmin: true },
  { email: 'test2@example.com', displayName: 'Test Two', isAdmin: false },
  { email: 'test3@example.com', displayName: 'Test Three', isAdmin: false },
  { email: 'test4@example.com', displayName: 'Test Four', isAdmin: false },
];

console.log(`Seed target: project "${PROJECT_ID}" on ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(
  'Nothing to seed yet — the data model lands in Milestone 3 and the seeded week in Milestone 5.',
);
