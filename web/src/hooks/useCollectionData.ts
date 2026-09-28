import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

/**
 * Subscribes to a whole collection at a slash-joined path. Pass `null` (or
 * `enabled: false`) to skip — used when the security rules would deny the
 * query outright, e.g. picks while the week is still `open` (SPEC.md §6).
 */
export function useCollectionData<T>(
  path: string | null,
  enabled = true,
): { data: (T & { id: string })[] | null; loading: boolean } {
  const [data, setData] = useState<(T & { id: string })[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path || !enabled) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      collection(db, path),
      (snap) => {
        setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
        setLoading(false);
      },
      () => {
        setData(null);
        setLoading(false);
      },
    );
  }, [path, enabled]);

  return { data, loading };
}
