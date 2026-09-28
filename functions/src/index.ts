/**
 * Cloud Functions for The Vault (2nd gen, Node 20).
 *
 * Milestone 1 ships only a `ping` health check so the Functions emulator has
 * something to load and the web app can prove its callable wiring works.
 * Milestone 3 implements every function in SPEC.md §5.
 */
import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { SHARED_VERSION } from '@vault/shared';

initializeApp();

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/** Health check: confirms the callable transport and the /shared import chain. */
export const ping = onCall((request) => {
  return {
    ok: true,
    sharedVersion: SHARED_VERSION,
    uid: request.auth?.uid ?? null,
    serverTime: new Date().toISOString(),
  };
});
