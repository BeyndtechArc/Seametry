import { NextRequest, NextResponse } from "next/server";
import { currentDeployment } from "@/lib/activity";
import { postInternal } from "@/lib/internal-gateway";
import { logRefusal } from "@/lib/refusal-log";

const WINDOW_MS = 10 * 60_000;
const MESSAGES_PER_WINDOW = 5;
const FALLBACK = "Email seametry@beyndtech.com instead.";

// Per instance and in memory only: enough to stop one page flooding the
// inbox, not a guarantee across Vercel's instances. The address is not kept.
const recent = new Map<string, { since: number; messages: number }>();

function admitted(address: string, now: number): boolean {
  for (const [key, window] of recent) if (now - window.since > WINDOW_MS) recent.delete(key);
  const window = recent.get(address) ?? { since: now, messages: 0 };
  window.messages += 1;
  recent.set(address, window);
  return window.messages <= MESSAGES_PER_WINDOW;
}

/**
 * Feedback from /feedback, forwarded to Alert on the Gateway, which keeps it
 * and mails it to the team. The visitor's answer waits only for it to be
 * kept, never for the mail.
 */
export async function POST(request: NextRequest) {
  let body: { message?: unknown; replyTo?: unknown; wallet?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the feedback as JSON with a message." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Write what happened or what should change." }, { status: 400 });
  if (message.length > 4000) return NextResponse.json({ error: `The message is ${message.length} characters; at most 4,000 are kept.` }, { status: 400 });
  const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : "";
  if (replyTo && (replyTo.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(replyTo))) {
    return NextResponse.json({ error: "That email address is incomplete. Leave it empty if you do not need a reply." }, { status: 400 });
  }
  const wallet = typeof body.wallet === "string" ? body.wallet : "";
  const page = typeof body.page === "string" ? body.page.slice(0, 500) : "";

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!admitted(address, Date.now())) {
    return NextResponse.json({ error: `Five messages in ten minutes is the limit from one address. ${FALLBACK}` }, { status: 429 });
  }

  let response: Response | undefined;
  try {
    response = await postInternal("feedback", {
      message, deployment: currentDeployment,
      ...(replyTo ? { reply_to: replyTo } : {}), ...(wallet ? { wallet } : {}), ...(page ? { page } : {}),
    }, 10_000);
  } catch {
    return NextResponse.json({ error: `Feedback could not reach Seametry just now. ${FALLBACK}` }, { status: 503 });
  }
  if (!response) return NextResponse.json({ error: `Feedback is not connected on this deployment. ${FALLBACK}` }, { status: 503 });
  if (response.status === 400) {
    // The checks above match the Gateway's, so this is rare; its detail names
    // a field for the log, not a sentence for the reader.
    const reference = await logRefusal("Feedback", response);
    return NextResponse.json({ error: `Seametry could not accept this feedback as written. ${FALLBACK}`, reference }, { status: 400 });
  }
  if (!response.ok) return NextResponse.json({ error: `Feedback could not be kept just now. ${FALLBACK}` }, { status: 503 });
  return NextResponse.json({ received: true }, { status: 202 });
}
