import { NextRequest, NextResponse } from "next/server";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { allocationOffer } from "@/lib/allocation/offer";
import { routeHistoryConfigured, readRouteHistories } from "@/lib/market/route-history-store";
import { acquisitionQuoteIndex, ROUTE_SAMPLE_USDC_ATOMS } from "@/lib/market/route-observations";

export const dynamic = "force-dynamic";

const source = "Jupiter · onchain routed USDC quote";

function unavailable(id: string, reason: string) {
  return NextResponse.json({
    available: false, id, source, reason,
  }, { headers: { "Cache-Control": "public, s-maxage=120" } });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const basket = findAllocationIndex(id);
  if (!basket) return NextResponse.json({ error: "Unknown Basket." }, { status: 404 });

  if (basket.researchOnly) {
    return unavailable(id, "Research-only baskets have no admitted execution route.");
  }
  const bySymbol = new Map(allocationOffer().offered.map((lot) => [lot.symbol, lot]));
  const mints = basket.members.map((member) => bySymbol.get(member.symbol)?.mint);
  if (mints.some((mint) => !mint)) {
    return unavailable(id, "A constituent is not yet admitted for live route observations.");
  }
  if (!routeHistoryConfigured()) {
    return unavailable(id, "Route history has not been enabled in this deployment.");
  }

  try {
    const histories = await readRouteHistories(mints as string[]);
    const points = acquisitionQuoteIndex(mints as string[], histories);
    if (points.length < 2) {
      return unavailable(id, "Collecting consecutive complete basket observations. No historical series yet.");
    }
    const current = points[points.length - 1];
    return NextResponse.json({
      available: true,
      id,
      source,
      kind: "Indicative fixed-unit basket acquisition quote index; not NAV, executable P&L or exchange-traded returns",
      method: "25 USDC exact-input Jupiter quote per constituent; first complete basket day normalized to 100; no intermediate rebalancing",
      sampleSizeUsdcAtoms: ROUTE_SAMPLE_USDC_ATOMS.toString(),
      lastSampledDay: new Date(current.time * 1_000).toISOString().slice(0, 10),
      points,
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch {
    return NextResponse.json({
      available: false, id, source, reason: "Recorded route observations are temporarily unavailable.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
