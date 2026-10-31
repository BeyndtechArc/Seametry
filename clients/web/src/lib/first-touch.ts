import type { FirstTouch } from "./activity-report";
import { recordedRef } from "./ref-link";

// Where this browser first arrived, kept in its own storage and sent once
// per wallet, with that wallet's first quote. A visitor who never trades
// sends only the page each entry to the site landed on and its referral
// code, to a daily count that keeps nothing else (countVisit). Every read
// and write tolerates storage that is blocked or cleared: losing a first
// touch costs attribution, never a trade.

const TOUCH = "seametry:first-touch";
const SENT = "seametry:first-touch-sent";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/**
 * Adds one entry to the day's count for the page it landed on and the
 * referral code it came with. An entry is a page load whose referrer is not
 * this site. It reads and writes nothing in the browser's storage: telling
 * a reload from a new visit would need a mark kept on the device, and
 * docs/decisions/2026-10-16-activity-record.md left anything kept on the
 * device for counting visits to a consent decision not yet made. So a reload
 * may count again, and a count is entries reported, not people.
 */
export function countVisit() {
  const url = new URL(window.location.href);
  try {
    if (document.referrer && new URL(document.referrer).host === url.host) return;
  } catch {
    // An unreadable referrer is not this site's: the load is an entry.
  }
  const ref = url.searchParams.get("ref")?.trim();
  const body = JSON.stringify({ path: url.pathname, ...(ref ? { ref: recordedRef(ref) } : {}) });
  try {
    if (navigator.sendBeacon?.("/api/activity/visits", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Some browsers refuse a beacon; fetch with keepalive is the same promise.
  }
  void fetch("/api/activity/visits", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

export function captureFirstTouch() {
  try {
    if (localStorage.getItem(TOUCH)) return;
    const url = new URL(window.location.href);
    const touch: FirstTouch = { landing_path: url.pathname.slice(0, 500) };
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.host !== url.host) touch.referrer_host = referrer.host.slice(0, 255);
    }
    for (const key of UTM) {
      const value = url.searchParams.get(key)?.trim();
      if (value) touch[key] = value.slice(0, 200);
    }
    // Set by a /r/{code} link. Read through recordedRef again, since anyone
    // can type ?ref= into a URL by hand.
    const ref = url.searchParams.get("ref")?.trim();
    if (ref) touch.ref_code = recordedRef(ref);
    localStorage.setItem(TOUCH, JSON.stringify(touch));
  } catch {
    // Storage blocked: this visit is not attributed.
  }
}

function sentTo(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SENT) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((wallet): wallet is string => typeof wallet === "string") : [];
  } catch {
    return [];
  }
}

/** The stored first touch, unless this wallet has already been sent it. */
export function firstTouchFor(wallet: string): FirstTouch | undefined {
  if (sentTo().includes(wallet)) return undefined;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TOUCH) ?? "null");
    return parsed && typeof parsed === "object" ? (parsed as FirstTouch) : undefined;
  } catch {
    return undefined;
  }
}

/** The ref code this browser first arrived with, if any, whether or not it has been sent with a quote. */
export function firstRefCode(): string | undefined {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TOUCH) ?? "null");
    const code = parsed && typeof parsed === "object" ? (parsed as FirstTouch).ref_code : undefined;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

export function firstTouchSent(wallet: string) {
  try {
    const sent = sentTo();
    if (!sent.includes(wallet)) localStorage.setItem(SENT, JSON.stringify([...sent, wallet].slice(-20)));
  } catch {
    // Storage blocked: the next quote sends the first touch again, and the record keeps the first.
  }
}
