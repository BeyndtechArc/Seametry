import { NextRequest } from "next/server";
import { refLocation } from "@/lib/ref-link";

// No cookie, no log of the visitor and no lookup: the redirect only puts the
// code in the landing URL, where first-touch.ts keeps it in this browser's
// storage until a wallet's first quote. The Location is relative, so it stays
// on whatever host served the link.
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return new Response(null, {
    status: 302,
    headers: { Location: refLocation(code, request.nextUrl.searchParams.get("to")), "Cache-Control": "no-store" },
  });
}
