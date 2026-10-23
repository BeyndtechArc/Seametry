// Short links for GTM (/r/{code}), so a DM or a post carries seametry.xyz/r/x
// instead of a row of UTM tags. The code is resolved here, from a list in the
// source, rather than from a Gateway table: the gtm schema that would hold
// minted codes (R1, R4 in the GTM requests) does not exist yet, and these
// channel codes ship before it. When it lands, this list moves into it.

/** The channels GTM tags its links with from day one. */
export const REF_CHANNELS = ["x", "tg", "discord", "dm"] as const;

/** What a code outside the list is recorded as, so it is counted, never dropped and never echoed. */
export const UNKNOWN_REF = "unknown";

// Lowercase letters, digits, hyphen and underscore, starting with a letter or
// digit, 40 characters at most (the record's cap, ActivityFirstTouch.ref_code).
// Underscore is allowed because X and Telegram handles use it; a dot is not,
// so a Discord name with one has to be written without it.
const CODE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
// dm-<handle>: a DM tagged by hand with the handle it went to.
const PERSONAL_DM = /^dm-[a-z0-9_]{1,37}$/;

/** The code as written, lowercased, if it has the shape of one. */
export function refCode(raw: string): string | undefined {
  const code = raw.trim().toLowerCase();
  return CODE.test(code) ? code : undefined;
}

/**
 * The value first touch keeps for a code: the code itself when it is a
 * listed channel or a dm-<handle>, and "unknown" for anything else, malformed
 * or not, so a mistyped or invented code still reaches the record as a
 * visit through a ref link without putting arbitrary text in it.
 */
export function recordedRef(raw: string): string {
  const code = refCode(raw);
  if (code && ((REF_CHANNELS as readonly string[]).includes(code) || PERSONAL_DM.test(code))) return code;
  return UNKNOWN_REF;
}

// Exact same-origin paths a link may land on. `to` is only ever compared
// against this list and the Location written is the listed string, never the
// input, so no value of `to` can send a visitor off the site.
const TARGETS = ["/", "/app", "/app/allocation", "/app/instruments", "/app/baskets", "/thesis", "/patterns", "/docs/papers/the-exit", "/feedback"] as const;

/** Where a ref link lands: the listed path named by `to`, or the home page. */
export function refTarget(to: string | null | undefined): string {
  return to && (TARGETS as readonly string[]).includes(to) ? to : "/";
}

/** The Location a ref link answers with. */
export function refLocation(code: string, to: string | null | undefined): string {
  return `${refTarget(to)}?ref=${recordedRef(code)}`;
}
