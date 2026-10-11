import { NextRequest, NextResponse } from "next/server";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { equalWeightReference, equityDailyHistory } from "@/lib/market/pyth-pro";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? undefined;
  const index = findAllocationIndex(id);
  if (!index) return NextResponse.json({ error: "Unknown Allocation index." }, { status: 404 });

  try {
    const histories = await Promise.all(index.members.map((member) => equityDailyHistory(member.oracleTicker)));
    const points = equalWeightReference(histories);
    if (points.length < 2) return NextResponse.json({ error: "The complete reference series is unavailable." }, { status: 503 });
    return NextResponse.json({
      id: index.id,
      methodologyVersion: index.methodologyVersion,
      source: "Pyth Pro",
      kind: "price-only equal-weight reference",
      observedAt: new Date().toISOString(),
      points,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Reference market data is unavailable.",
      source: "Pyth Pro",
    }, { status: 503 });
  }
}
