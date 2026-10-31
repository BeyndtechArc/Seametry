import { NextRequest, NextResponse } from "next/server";
import { recordVisit } from "@/lib/activity";

const WINDOW_MS = 60_000;
const VISITS_PER_WINDOW = 60;

// Per instance and held in memory only, as the funnel route's is: enough to
// stop one page looping, not a guarantee across Vercel's instances. The
// address is never recorded.
const recent = new Map<string, { since: number; visits: number }>();

function admitted(address: string, now: number): boolean {
  for (const [key, window] of recent) if (now - window.since > WINDOW_MS) recent.delete(key);
  const window = recent.get(address) ?? { since: now, visits: 0 };
  window.visits += 1;
  recent.set(address, window);
  return window.visits <= VISITS_PER_WINDOW;
}

/**
 * One browser session's landing page and referral code, added to Growth's
 * daily count. Nothing that identifies the visitor is sent on: not the
 * address, not a cookie, not a wallet.
 */
export async function POST(request: NextRequest) {
  let body: { path?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with path, and ref when the visit came through a referral link." }, { status: 400 });
  }
  if (typeof body.path !== "string") {
    return NextResponse.json({ error: "path must be the page this session opened first, as a string." }, { status: 400 });
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Past the limit the entry goes uncounted but still answers 204: many people
  // can share one address, and a count must never put an error in their page.
  if (admitted(address, Date.now())) recordVisit(body.path, body.ref);
  return new NextResponse(null, { status: 204 });
}
