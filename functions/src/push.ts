import { getMessaging } from 'firebase-admin/messaging';
import type { PushSender } from './logic/notify.js';

/** FCM says these tokens will never work again, so they're deleted. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Sends through Firebase Cloud Messaging as data-only web pushes. The app's
 * own service worker (web/public/push-sw.js) shows the notification, so the
 * same payload works on iOS, Android and desktop browsers.
 */
export const fcmSender: PushSender = {
  async send(tokens, message) {
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { title: message.title, body: message.body, tab: message.tab },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
    });
    const deadTokens = res.responses
      .map((r, i) => (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code) ? tokens[i]! : null))
      .filter((t): t is string => t !== null);
    return { deadTokens };
  },
};
