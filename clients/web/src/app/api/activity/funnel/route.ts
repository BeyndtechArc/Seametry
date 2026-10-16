import { NextRequest, NextResponse } from "next/server";
import { recordFunnel } from "@/lib/activity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_MS = 60_000;
const EVENTS_PER_WINDOW = 60;

// Per instance and held in memory only: enough to stop one page looping,
// not a guarantee across Vercel's instances. The address is never recorded.
const recent = new Map<string, { since: number; events: number }>();

function admitted(address: string, events: number, now: number): boolean {
  for (const [key, window] of recent) if (now - window.since > WINDOW_MS) recent.delete(key);
  const window = recent.get(address) ?? { since: now, events: 0 };
  window.events += events;
  recent.set(address, window);
  return window.events <= EVENTS_PER_WINDOW;
}

/**
 * Funnel steps only the browser sees, forwarded to Execution's record. The
 * browser's word: these never count as volume, a fee or an outcome.
 */
export async function POST(request: NextRequest) {
  let body: { events?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with events, each with a kind." }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > 20) {
    return NextResponse.json({ error: `Expected 1 to 20 events; received ${events.length}.` }, { status: 400 });
  }
  const forwarded: { kind: string; wallet?: string; quote_id?: string }[] = [];
  for (const [index, event] of events.entries()) {
    const { kind, wallet, quoteId } = (event ?? {}) as { kind?: unknown; wallet?: unknown; quoteId?: unknown };
    if (typeof kind !== "string" || kind.length === 0 || kind.length > 80) {
      return NextResponse.json({ error: `events[${index}].kind must be a string of 1 to 80 characters.` }, { status: 400 });
    }
    forwarded.push({
      kind,
      ...(typeof wallet === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet) ? { wallet } : {}),
      ...(typeof quoteId === "string" && UUID.test(quoteId) ? { quote_id: quoteId.toLowerCase() } : {}),
    });
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!admitted(address, forwarded.length, Date.now())) {
    return NextResponse.json({ error: "Too many funnel steps from this address in the last minute." }, { status: 429 });
  }
  recordFunnel(forwarded);
  return new NextResponse(null, { status: 204 });
}
