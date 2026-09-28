import { Timestamp } from 'firebase-admin/firestore';
import type { Player } from '@vault/shared';
import { playerDoc } from '../../src/paths.js';
import { db } from './emulator.js';

/** Obviously-fake players (CLAUDE.md fixture rule), used only in these emulator tests. */
export async function seedPlayers(uids: string[]): Promise<void> {
  await Promise.all(
    uids.map((uid) => {
      const player: Player = {
        displayName: uid,
        email: `${uid.toLowerCase()}@example.com`,
        isAdmin: false,
        createdAt: Timestamp.now(),
      };
      return playerDoc(db, uid).set(player);
    }),
  );
}
