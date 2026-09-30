import { NextRequest, NextResponse } from "next/server";
import { allocationConfig } from "@/lib/allocation/config";
import { legStatus } from "@/lib/allocation/execution";

/** Where a sent leg stands on mainnet: pending, confirmed, finalized or failed. */
export async function GET(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  }
  const signature = request.nextUrl.searchParams.get("signature");
  if (!signature || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) {
    return NextResponse.json({ error: "Expected ?signature= a base58 transaction signature." }, { status: 400 });
  }
  try {
    return NextResponse.json(await legStatus(configured.config, signature));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reading the status failed." }, { status: 502 });
  }
}
