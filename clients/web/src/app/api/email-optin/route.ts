import { NextRequest, NextResponse } from "next/server";
import { currentDeployment } from "@/lib/activity";
import { CONSENT_VERSION, OPT_IN_PAGES, plainAddress, type OptInPage } from "@/lib/email-optin";
import { postInternal } from "@/lib/internal-gateway";
import { recordedRef } from "@/lib/ref-link";

const WINDOW_MS = 10 * 60_000;
const OPT_INS_PER_WINDOW = 5;

// Per instance and in memory only, as for feedback: enough to stop one page
// submitting addresses in a loop. The network address is not kept.
const recent = new Map<string, { since: number; count: number }>();

function admitted(address: string, now: number): boolean {
  for (const [key, window] of recent) if (now - window.since > WINDOW_MS) recent.delete(key);
  const window = recent.get(address) ?? { since: now, count: 0 };
  window.count += 1;
  recent.set(address, window);
  return window.count <= OPT_INS_PER_WINDOW;
}

/**
 * An email address given with the consent box ticked, forwarded to Alert
 * on the Gateway. The consent version is this deployment's, never the
 * browser's word, so a stored opt-in names the sentence this build shows.
 */
export async function POST(request: NextRequest) {
  let body: { address?: unknown; consent?: unknown; consentVersion?: unknown; wallet?: unknown; refCode?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the address as JSON with consent set to true." }, { status: 400 });
  }
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!plainAddress(address)) return NextResponse.json({ error: "That email address is incomplete." }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ error: "Tick the box to agree before giving an address. Nothing is kept without it." }, { status: 400 });
  if (body.consentVersion !== CONSENT_VERSION) {
    return NextResponse.json({ error: "The wording on this page has changed since it was opened. Reload the page and read it again." }, { status: 409 });
  }
  const page = (OPT_IN_PAGES as readonly string[]).includes(body.page as string) ? (body.page as OptInPage) : undefined;
  const wallet = typeof body.wallet === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.wallet) ? body.wallet : undefined;
  const refCode = typeof body.refCode === "string" && body.refCode ? recordedRef(body.refCode) : undefined;

  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!admitted(client, Date.now())) {
    return NextResponse.json({ error: "Five addresses in ten minutes is the limit from one network address. Try again later." }, { status: 429 });
  }

  let response: Response | undefined;
  try {
    response = await postInternal("email-optins", {
      address, consent_version: CONSENT_VERSION, deployment: currentDeployment,
      ...(page ? { page } : {}), ...(wallet ? { wallet } : {}), ...(refCode ? { ref_code: refCode } : {}),
    });
  } catch {
    return NextResponse.json({ error: "The address could not reach Seametry just now. Nothing was kept." }, { status: 503 });
  }
  if (!response) return NextResponse.json({ error: "Email updates are not connected on this deployment. Nothing was kept." }, { status: 503 });
  if (response.status === 400) {
    console.warn(`Email opt-in refused by the Gateway: ${(await response.text()).slice(0, 300)}`);
    return NextResponse.json({ error: "Seametry could not accept this address as written. Nothing was kept." }, { status: 400 });
  }
  if (!response.ok) return NextResponse.json({ error: "The address could not be kept just now. Nothing was kept." }, { status: 503 });
  const kept = (await response.json()) as { data: { unsubscribe_token: string } };
  const unsubscribe = new URL(`/unsubscribe?token=${encodeURIComponent(kept.data.unsubscribe_token)}`, request.nextUrl.origin).toString();
  return NextResponse.json({ kept: true, unsubscribe }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
