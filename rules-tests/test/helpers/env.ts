/**
 * Builds a `RulesTestEnvironment` for `firestore.rules` against the running
 * Firestore emulator. Run via the root `test:rules` script, which wraps this
 * in `firebase emulators:exec --only firestore` — that sets
 * `FIRESTORE_EMULATOR_HOST`, which `initializeTestEnvironment` discovers on
 * its own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.resolve(__dirname, '../../../firestore.rules');

export async function makeTestEnv(): Promise<RulesTestEnvironment> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set. Run rules tests via `npm run test:rules` at the repo root, ' +
        'which wraps them in `firebase emulators:exec`.',
    );
  }

  return initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'the-vault-dev',
    firestore: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
    },
  });
}
