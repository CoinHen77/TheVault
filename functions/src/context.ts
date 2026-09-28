/**
 * Auth/role extraction for onCall wrappers (CLAUDE.md: "Enforce auth and role
 * checks: Admin via custom claim, Bookholder via the week doc"). Admin is a
 * cheap short-circuit here; Bookholder depends on Firestore data and is
 * checked inside the relevant logic function instead.
 */
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

export function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');
  return uid;
}

export function isAdminRequest(request: CallableRequest): boolean {
  return request.auth?.token?.['admin'] === true;
}

/** Throws unless the caller's custom claim `admin: true` is set. */
export function requireAdmin(request: CallableRequest): string {
  const uid = requireUid(request);
  if (!isAdminRequest(request)) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
  return uid;
}
