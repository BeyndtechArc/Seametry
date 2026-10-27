// The consent an email opt-in records. The sentence is versioned: a stored
// opt-in names the version its holder ticked, so changing the words means
// a new version here, never an edit of the old one.

export const CONSENT_VERSION = "2026-10-27";

export const CONSENT_TEXT =
  "Email me when the Hall launches on mainnet and when my trades settle. Nothing else is sent. Every email carries a link to stop, and stopping erases this address.";

export const OPT_IN_PAGES = ["first_allocation", "feedback"] as const;
export type OptInPage = (typeof OPT_IN_PAGES)[number];

/** The same shape the feedback route accepts, and the Gateway's own check is stricter. */
export function plainAddress(value: string): boolean {
  return value.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
}
