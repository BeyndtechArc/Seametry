import { NextRequest, NextResponse } from "next/server";
import { allocationOffer, purchasesUnavailable } from "@/lib/allocation/offer";
import { ROUTING_FEE_TIERS, SLIPPAGE_BPS, feeSchedule } from "@/lib/allocation/rules";

/**
 * What an Allocation offers this request, for the mobile app: the same lots,
 * stamps and terms the web page renders, and whether this request may buy.
 * Logo paths are on this origin; a client outside it prefixes the origin.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      ...allocationOffer(),
      unavailable: purchasesUnavailable(request.headers) ?? null,
      feeTiers: ROUTING_FEE_TIERS,
      feeSchedule: feeSchedule(),
      slippageBps: SLIPPAGE_BPS,
    },
    // Public, read-only and credential-free, so any origin may read it: the
    // app's browser preview runs on its own origin. Prepare and submit stay
    // same-origin; a native app is not subject to CORS at all.
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
