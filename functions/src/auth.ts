/**
 * SPEC.md §6 membership gate: only invited emails may sign in to The Vault.
 *
 * A `beforeUserCreated` blocking function runs before Firebase Auth commits
 * a new account. If the email has no `invites/{email}` doc, account creation
 * is rejected outright. If it does, this also provisions `players/{uid}`
 * here (server-side, via the Admin SDK) — firestore.rules lets a client
 * update only their own `displayName` afterward, never create the doc.
 */
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, beforeUserCreated } from 'firebase-functions/v2/identity';
import type { Invite, Player } from '@vault/shared';
import { inviteDoc, playerDoc } from './paths.js';

export const rejectUninvitedUsers = beforeUserCreated(async (event) => {
  const rawEmail = event.data?.email;
  const uid = event.data?.uid;
  if (!rawEmail || !uid) {
    throw new HttpsError('invalid-argument', 'An email address is required to sign in to The Vault.');
  }
  const email = rawEmail.toLowerCase();

  const db = getFirestore();
  const inviteSnap = await inviteDoc(db, email).get();
  if (!inviteSnap.exists) {
    throw new HttpsError('permission-denied', 'This email has not been invited to The Vault.');
  }
  const invite = inviteSnap.data() as Invite;

  const player: Player = {
    displayName: invite.displayName ?? email.split('@')[0]!,
    email,
    isAdmin: false,
    createdAt: Timestamp.now(),
  };
  await playerDoc(db, uid).set(player, { merge: true });
});
