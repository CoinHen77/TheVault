/**
 * Emulator-backed Firestore instance for logic-layer tests. Runs under
 * `firebase emulators:exec` (root script `test:functions`), which sets
 * FIRESTORE_EMULATOR_HOST for us — refuse to run otherwise so a stray test
 * run can never touch production.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'the-vault-f417a';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST is not set. Run functions tests via `npm run test:functions` at the repo root, ' +
      'which wraps them in `firebase emulators:exec`.',
  );
}

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}

export const db: Firestore = getFirestore();

/** Wipes all Firestore documents in the emulator so each test file starts clean. */
export async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const url = `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${res.status} ${await res.text()}`);
  }
}
