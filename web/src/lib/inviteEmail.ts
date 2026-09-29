import { COPY } from './copy';

/**
 * Builds the invite email sent via the "Trigger Email from Firestore"
 * extension (a doc written to the `mail` collection). Plain inline styles
 * only — no external CSS or dark-mode assumptions, since email clients
 * render HTML inconsistently.
 */
export function buildInviteEmail(appUrl: string, displayName?: string): { subject: string; html: string } {
  const heading = displayName ? `${displayName}, ${COPY.inviteEmailHeading.toLowerCase()}` : COPY.inviteEmailHeading;

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <h1 style="font-size: 22px; color: #0b3d2e; margin: 0 0 16px;">${heading}</h1>
      <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px;">${COPY.inviteEmailBody}</p>
      <a href="${appUrl}" style="display: inline-block; background: #c9a227; color: #111111; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 8px;">${COPY.inviteEmailCta}</a>
      <p style="font-size: 12px; color: #777777; margin-top: 32px;">Invite-only. If this wasn't meant for you, you can ignore this email.</p>
    </div>
  `.trim();

  return { subject: COPY.inviteEmailSubject, html };
}
