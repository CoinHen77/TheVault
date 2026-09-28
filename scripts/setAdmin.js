/**
 * Grants the `admin: true` custom claim (CLAUDE.md/SPEC.md §2: "`admin: true`
 * is a custom claim") to an existing Auth user, and mirrors it onto
 * players/{uid}.isAdmin (SPEC.md §3: that field "mirrors custom claim, for
 * UI only"). The user must already exist — they need to have signed in once
 * (which requires an invites/{email} doc; see scripts/invite.js) before this
 * can find them.
 *
 * Usage:
 *   node scripts/setAdmin.js <email> [--emulator]
 *
 * After this runs, the user must sign out and back in (or force-refresh
 * their ID token) before the new claim reaches them.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const useEmulator = args.includes('--emulator');
const email = args.find((a) => !a.startsWith('--'));

if (!email) {
  console.error('Usage: node scripts/setAdmin.js <email> [--emulator]');
  process.exit(1);
}

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
}

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'the-vault-dev';
const targetingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

console.log(
  `Target: project "${PROJECT_ID}" — ${targetingEmulator ? `EMULATOR (${process.env.FIREBASE_AUTH_EMULATOR_HOST})` : 'PRODUCTION'}`,
);
if (!targetingEmulator) {
  console.log('No --emulator flag and no emulator env vars set: this will modify the REAL project.');
}

initializeApp({ projectId: PROJECT_ID });

const auth = getAuth();
const normalizedEmail = email.toLowerCase();
const user = await auth.getUserByEmail(normalizedEmail);

await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
await getFirestore().collection('players').doc(user.uid).set({ isAdmin: true }, { merge: true });

console.log(`${normalizedEmail} (${user.uid}) is now an Admin.`);
console.log('They must sign out and back in for the new claim to take effect.');
