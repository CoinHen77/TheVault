import type { Comment } from '@vault/shared';
import { useCollectionData } from './useCollectionData';

/** Newest first, sorted client-side like the rest of this app's small collections (e.g. useStandings). */
export function useComments() {
  const { data, loading } = useCollectionData<Comment>('comments');
  const sorted = data ? [...data].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()) : null;
  return { data: sorted, loading };
}
