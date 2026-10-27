import { NextRequest, NextResponse } from "next/server";
import { postInternal } from "@/lib/internal-gateway";

/** Withdraws the opt-in an unsubscribe link's token belongs to. */
export async function POST(request: NextRequest) {
  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Open the unsubscribe link again; this request carried no token." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 100) return NextResponse.json({ error: "This link carries no unsubscribe token. Open the link from the email again." }, { status: 400 });
  let response: Response | undefined;
  try {
    response = await postInternal("email-optins/unsubscribe", { token });
  } catch {
    return NextResponse.json({ error: "Seametry could not be reached. The address is still kept; try the link again later, or write to seametry@beyndtech.com." }, { status: 503 });
  }
  if (!response) return NextResponse.json({ error: "Unsubscribing is not connected on this deployment. Write to seametry@beyndtech.com and the address will be removed by hand." }, { status: 503 });
  if (response.status === 404) return NextResponse.json({ error: "This link is not recognised. It may have been used already, or replaced when the address was given again." }, { status: 404 });
  if (!response.ok) return NextResponse.json({ error: "The address could not be removed just now. Try the link again later, or write to seametry@beyndtech.com." }, { status: 503 });
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
