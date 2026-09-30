import { NextRequest, NextResponse } from "next/server";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { Refusal, prepareLeg } from "@/lib/allocation/execution";
import { countryGate } from "@/lib/allocation/rules";

/** Quotes, builds, checks and simulates one Allocation leg for the connected wallet. Never signs it. */
export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  }
  const gate = countryGate(requestCountry(request.headers), configured.config.blockedCountries);
  if (!gate.open) return NextResponse.json({ error: gate.reason }, { status: 451 });

  let body: { wallet?: string; mint?: string; usdcAtoms?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with wallet, mint and usdcAtoms." }, { status: 400 });
  }
  if (!body.wallet || !body.mint || !body.usdcAtoms || !/^\d+$/.test(body.usdcAtoms)) {
    return NextResponse.json({ error: "Expected wallet, mint, and usdcAtoms as a string of digits." }, { status: 400 });
  }

  try {
    return NextResponse.json(await prepareLeg(configured.config, body.wallet, body.mint, BigInt(body.usdcAtoms)));
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preparing the leg failed." }, { status: 500 });
  }
}
