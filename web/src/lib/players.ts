import type { Player } from '@vault/shared';

/** Players sorted alphabetically by display name, for the Admin screen's player pickers. */
export function sortedPlayers(players: Record<string, Player>): { uid: string; player: Player }[] {
  return Object.entries(players)
    .map(([uid, player]) => ({ uid, player }))
    .sort((a, b) => a.player.displayName.localeCompare(b.player.displayName));
}
