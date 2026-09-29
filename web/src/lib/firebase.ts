import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/**
 * Emulator-first config. Real values arrive via .env.local (see .env.example)
 * when we deploy in Milestone 7; until then the placeholder project id is all
 * the emulators need.
 */
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'emulator-api-key',
  // The app's own Hosting domain (not firebaseapp.com) so sign-in stays same-site: Safari and
  // installed iOS apps block the cross-site storage the firebaseapp.com handler relies on (CLAUDE.md H6).
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'the-vault-f417a.web.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'the-vault-f417a',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'the-vault-f417a.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:000000000000:web:0000000000000000000000',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');

/** Emulators are the default in dev; set VITE_USE_EMULATORS=false to opt out. */
export const usingEmulators =
  import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS !== 'false';

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
