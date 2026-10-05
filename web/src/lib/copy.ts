/**
 * Heist wording for the UI (CLAUDE.md Phase 1.5). Display text only: data
 * fields keep their SPEC.md names (e.g. `bookholderId`). To drop the motif
 * for any term, change it here.
 */
export const COPY = {
  appName: 'The Vault',

  // People and roles
  crew: 'crew',
  bookholder: 'key holder',
  bookholderTitle: 'Key holder',
  admin: 'Control room',

  // Screens
  rules: 'The Code',
  rulesSubtitle: 'How the job works',
  pickTitle: 'Fill your ticket',
  bookTitle: 'The Book',
  sharpTitle: 'The Sharp',

  // Picks
  bestBet: 'Your Best Bet',
  ticket: 'Ticket',
  sealPick: 'Seal it',
  resealPick: 'Reseal it',
  sealed: 'Sealed',
  sealedNote: 'Sealed. Nobody sees it until the vault opens.',
  waiting: 'Waiting',
  envelopes: 'Envelopes',
  envelopesIn: 'Envelopes in',

  // Odds board (The Odds API)
  oddsBoard: 'The board',
  oddsBoardHint: 'DraftKings lines. Tap one to fill your ticket, then edit anything you like.',
  openVaultEarly: 'Open the vault early',

  // Week status badges, by data status
  weekStatus: {
    open: 'Taking picks',
    locked: 'Vault open',
    grading: 'Grading',
    closed: 'Closed',
  },

  // The vault opening (Friday 4 PM, or early): picks become final, envelopes
  // unseal and the key holder bets. Data still calls this status 'locked'.
  vaultSealed: 'The vault is sealed',
  vaultOpening: 'Opening…',
  vaultOpen: 'The vault is open',
  opensIn: 'Opens in',
  vaultOpensAt: 'Vault opens at',
  inTheVault: 'In the vault',
  yourCut: 'Your cut',

  // The Book / key
  earnedKey: 'You earned the key',
  holdKey: 'You hold the key',
  keyGoesTo: 'Key goes to',
  capTaken: 'Taken from the vault',

  // Sign-in
  signInTagline: "Crew only. Sign in to see this week's job.",
  inviteOnly: "Invite-only. If you're not on the list, the door stays shut.",

  // Invite email
  inviteEmailSubject: "You're in — The Vault",
  inviteEmailHeading: "The crew wants you in.",
  inviteEmailBody: "You've been invited to The Vault. Sign in with this email address to see this week's job.",
  inviteEmailCta: 'Open The Vault',

  // Comment board
  commentsTitle: "Kade's Comment Section",
  commentsSubtitle: 'Say your piece.',
  commentsPlaceholder: 'Say something…',
  commentsPost: 'Post',
  commentsEmpty: 'Nobody has said anything yet.',
} as const;
