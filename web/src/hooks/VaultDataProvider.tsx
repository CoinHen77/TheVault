import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { withSeasonDefaults, type Player, type Season } from '@vault/shared';
import { db } from '../lib/firebase';
import { useCollectionData } from './useCollectionData';
import { useDocData } from './useDocData';

interface VaultData {
  loading: boolean;
  season: (Season & { id: string }) | null;
  week: (import('@vault/shared').Week & { id: string }) | null;
  players: Record<string, Player>;
}

const VaultDataContext = createContext<VaultData | null>(null);

/**
 * There is exactly one active season at a time (Phase 1); this finds it and
 * loads its current week and the player roster. Screens read this via
 * `useVaultData()` instead of each subscribing independently.
 */
export function VaultDataProvider({ children }: { children: ReactNode }) {
  const [season, setSeason] = useState<(Season & { id: string }) | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'seasons'), where('status', '==', 'active'), limit(1));
    return onSnapshot(
      q,
      (snap) => {
        const d = snap.docs[0];
        setSeason(d ? withSeasonDefaults({ id: d.id, ...(d.data() as Season) }) : null);
        setSeasonLoading(false);
      },
      () => setSeasonLoading(false),
    );
  }, []);

  const weekPath = season ? `seasons/${season.id}/weeks/${season.currentWeekId}` : null;
  const { data: week, loading: weekLoading } = useDocData<import('@vault/shared').Week>(weekPath);

  const { data: playerDocs } = useCollectionData<Player>('players');
  const players: Record<string, Player> = {};
  for (const p of playerDocs ?? []) players[p.id] = p;

  const loading = seasonLoading || (Boolean(season) && weekLoading);

  return <VaultDataContext value={{ loading, season, week, players }}>{children}</VaultDataContext>;
}

export function useVaultData(): VaultData {
  const ctx = use(VaultDataContext);
  if (!ctx) throw new Error('useVaultData must be used within a VaultDataProvider');
  return ctx;
}
