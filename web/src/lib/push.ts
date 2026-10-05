import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db } from './firebase';
import { isIOS, isStandalone } from './standalone';

/** This device's token, so turning off or signing out can remove it. */
const TOKEN_KEY = 'vault:push-token';
const SW_URL = '/push-sw.js';

export type PushAvailability =
  | 'ready' // can be turned on here
  | 'needs-install' // iPhone/iPad in a browser tab: install to the Home Screen first
  | 'unsupported' // this browser can't do web push
  | 'no-key'; // the build has no VITE_FIREBASE_VAPID_KEY

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export async function pushAvailability(): Promise<PushAvailability> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) {
    return 'unsupported';
  }
  if (!VAPID_KEY) return 'no-key';
  return 'ready';
}

export function storedPushToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode: the token still works; it just can't be removed on sign-out from here.
  }
}

function platformLabel(): string {
  if (isIOS()) return isStandalone() ? 'iOS app' : 'iOS browser';
  if (/Android/.test(navigator.userAgent)) return isStandalone() ? 'Android app' : 'Android browser';
  return isStandalone() ? 'Desktop app' : 'Desktop browser';
}

/**
 * Asks for permission (must run from a tap), registers the push service
 * worker, and files this device's FCM token under the player.
 */
export async function enablePush(uid: string): Promise<void> {
  if (!VAPID_KEY) throw new Error('Notifications are not set up in this build yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this app. Allow them in your device or browser settings, then try again.'
        : 'Notifications were not allowed.',
    );
  }
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('This device did not return a notification token.');
  await setDoc(doc(db, 'pushTokens', token), { uid, platform: platformLabel(), createdAt: serverTimestamp() });
  rememberToken(token);
}

/** Stops notifications on this device: removes the token from FCM and from the player's list. */
export async function disablePush(): Promise<void> {
  const token = storedPushToken();
  rememberToken(null);
  if (!token) return;
  await deleteDoc(doc(db, 'pushTokens', token)).catch(() => undefined);
  if (await isSupported().catch(() => false)) {
    await deleteToken(getMessaging(app)).catch(() => undefined);
  }
}

/**
 * On app start: if this device already has notifications on, re-fetch its
 * token (FCM rotates them now and then) and swap the stored one if it changed.
 */
export async function refreshPushToken(uid: string): Promise<void> {
  const old = storedPushToken();
  if (!old || !VAPID_KEY || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(await isSupported().catch(() => false))) return;
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token || token === old) return;
  await setDoc(doc(db, 'pushTokens', token), { uid, platform: platformLabel(), createdAt: serverTimestamp() });
  await deleteDoc(doc(db, 'pushTokens', old)).catch(() => undefined);
  rememberToken(token);
}
