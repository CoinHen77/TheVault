import { beforeEach, describe, expect, it } from 'vitest';
import { inviteDoc, playerDoc } from '../src/paths.js';
import { clearFirestore, db } from './helpers/emulator.js';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!AUTH_HOST) {
  throw new Error(
    'FIREBASE_AUTH_EMULATOR_HOST is not set. Run this suite via `npm run test:functions`, which wraps it in ' +
      '`firebase emulators:exec --only firestore,auth,functions` — the Functions emulator is what makes the ' +
      "Auth emulator actually invoke `rejectUninvitedUsers` on sign-up.",
  );
}

const SIGN_UP_URL = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

async function signUp(email: string): Promise<{ status: number; body: any }> {
  const res = await fetch(SIGN_UP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  return { status: res.status, body: await res.json() };
}

/**
 * SPEC.md §6 membership gate, enforced by the `rejectUninvitedUsers`
 * `beforeUserCreated` blocking function (functions/src/auth.ts): sign-up is
 * rejected without an invites/{email} doc, and succeeds with one — which
 * also provisions players/{uid} server-side.
 */
describe('rejectUninvitedUsers (beforeUserCreated)', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('rejects sign-up for a non-invited email', async () => {
    const { status, body } = await signUp('uninvited@example.com');

    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).toMatch(/not been invited/i);
  });

  it('allows sign-up for an invited email and provisions players/{uid}', async () => {
    await inviteDoc(db, 'invited@example.com').set({
      invitedBy: 'test',
      invitedAt: new Date(),
      displayName: 'Invited Player',
    });

    const { status, body } = await signUp('invited@example.com');
    expect(status).toBe(200);
    expect(body.localId).toBeTruthy();

    const playerSnap = await playerDoc(db, body.localId).get();
    expect(playerSnap.exists).toBe(true);
    expect(playerSnap.data()).toMatchObject({
      email: 'invited@example.com',
      isAdmin: false,
      displayName: 'Invited Player',
    });
  });

  it("falls back to the email's local part when the invite has no displayName", async () => {
    await inviteDoc(db, 'noname@example.com').set({ invitedBy: 'test', invitedAt: new Date() });

    const { status, body } = await signUp('noname@example.com');
    expect(status).toBe(200);

    const playerSnap = await playerDoc(db, body.localId).get();
    expect(playerSnap.data()).toMatchObject({ displayName: 'noname' });
  });
});
