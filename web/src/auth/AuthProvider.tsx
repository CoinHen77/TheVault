import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import type { Player } from '@vault/shared';
import { auth, db } from '../lib/firebase';
import { disablePush } from '../lib/push';

interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: User | null;
  player: Player | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setPlayer(null);
        setIsAdmin(false);
        setStatus('signed-out');
        return;
      }
      const tokenResult = await nextUser.getIdTokenResult();
      setIsAdmin(tokenResult.claims['admin'] === true);
      setStatus('signed-in');
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'players', user.uid), (snap) => {
      setPlayer(snap.exists() ? (snap.data() as Player) : null);
    });
  }, [user]);

  const value: AuthState = {
    status,
    user,
    player,
    isAdmin,
    // Stop this device's notifications first: removing its token needs the player still signed in.
    signOut: async () => {
      await disablePush().catch(() => undefined);
      await firebaseSignOut(auth);
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
