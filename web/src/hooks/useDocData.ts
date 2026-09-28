import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';

/** Subscribes to a single doc at a slash-joined path. Pass `null` to skip. */
export function useDocData<T>(path: string | null): { data: (T & { id: string }) | null; loading: boolean } {
  const [data, setData] = useState<(T & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, path),
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null);
        setLoading(false);
      },
      () => {
        setData(null);
        setLoading(false);
      },
    );
  }, [path]);

  return { data, loading };
}
