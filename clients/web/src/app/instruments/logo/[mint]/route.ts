import { NextResponse } from "next/server";
import { logoOf, logoOfSymbol } from "@/lib/instrument-identity";

// A day: a recapture can change a logo's file type, so the mapping is not
// cached forever, while the file it points at is static and digest-recorded.
const MAPPING_MAX_AGE_SECONDS = 86_400;

/**
 * The mirrored logo of a listed mint, or of a listed symbol for a devnet
 * stand-in that has no real mint, by redirect. With none captured it answers
 * 204: the image fails and the lot mark draws its lettered tile, but a 2xx
 * is not logged as a failed resource, which a 404 on every unpictured row
 * was. A symbol is never 32 to 44 base58 characters, so the two cannot
 * collide.
 */
export async function GET(request: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const path = logoOf(mint) ?? logoOfSymbol(mint);
  if (!path) return new NextResponse(null, { status: 204, headers: { "cache-control": `public, max-age=${MAPPING_MAX_AGE_SECONDS}` } });
  return NextResponse.redirect(new URL(path, request.url), { status: 307, headers: { "cache-control": `public, max-age=${MAPPING_MAX_AGE_SECONDS}` } });
}
