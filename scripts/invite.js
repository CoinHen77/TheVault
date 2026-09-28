/**
 * Writes an invites/{email} doc directly via the Admin SDK, bypassing
 * firestore.rules (SPEC.md §6: only Admins can write invites through the
 * client, but there's no Admin yet the very first time this runs).
 *
 * Emulator use (Milestones 4–6, before the Admin UI exists):
 *   node scripts/invite.js test1@example.com "Test One" --emulator
 *
 * Production use is the Milestone 7 walkthrough only, and only once
 * firebase-admin has real credentials (`gcloud auth application-default
 * login` or a service account key via GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Usage:
 *   node scripts/invite.js <email> [displayName] [--emulator]
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const positional = args.filter((a) => !a.startsWith('--'));
const [email, displayName] = positional;

if (!email) {
  console.error('Usage: node scripts/invite.js <email> [displayName] [--emulator]');
  process.exit(1);
}

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
}

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'the-vault-f417a';
const targetingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

console.log(
  `Target: project "${PROJECT_ID}" — ${targetingEmulator ? `EMULATOR (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCTION'}`,
);
if (!targetingEmulator) {
  console.log('No --emulator flag and no FIRESTORE_EMULATOR_HOST set: this will write to the REAL project.');
}

initializeApp({ projectId: PROJECT_ID });

const normalizedEmail = email.toLowerCase();
const invite = {
  invitedBy: 'script',
  invitedAt: Timestamp.now(),
  ...(displayName ? { displayName } : {}),
};

await getFirestore().collection('invites').doc(normalizedEmail).set(invite);

console.log(`Invited ${normalizedEmail}.`);
