import { NextRequest, NextResponse } from "next/server";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { equalWeightReference, equityDailyHistory } from "@/lib/market/pyth-pro";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? undefined;
  const index = findAllocationIndex(id);
  if (!index) return NextResponse.json({ error: "Unknown Allocation basket." }, { status: 404 });
  const tickers = index.members.map((member) => member.oracleTicker).filter((ticker): ticker is string => Boolean(ticker));
  if (index.researchOnly || tickers.length !== index.members.length) {
    return NextResponse.json({ available: false, id: index.id, source: "Reference feed", reason: "No complete public-equity reference series is defined for this basket." });
  }

  try {
    const histories = await Promise.all(tickers.map((ticker) => equityDailyHistory(ticker, 30)));
    const points = equalWeightReference(histories);
    if (points.length < 2) return NextResponse.json({
      available: false,
      id: index.id,
      source: "Pyth Pro",
      reason: "The complete reference series is unavailable.",
    });
    return NextResponse.json({
      available: true,
      id: index.id,
      methodologyVersion: index.methodologyVersion,
      source: "Pyth Pro",
      kind: "price-only equal-weight reference",
      observedAt: new Date().toISOString(),
      points,
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      id: index.id,
      source: "Pyth Pro",
      reason: error instanceof Error ? error.message : "Reference market data is unavailable.",
    });
  }
}
