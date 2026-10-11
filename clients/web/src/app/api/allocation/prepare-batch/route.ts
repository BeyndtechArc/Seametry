import { NextRequest, NextResponse } from "next/server";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { prepareBatch } from "@/lib/allocation/execution";
import { Refusal } from "@/lib/refusal";
import { countryGate } from "@/lib/allocation/rules";

export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: "This deployment is not configured for Allocations: " + configured.missing.join(", ") + " not set." }, { status: 503 });
  }
  const gate = countryGate(requestCountry(request.headers), configured.config.blockedCountries);
  if (!gate.open) return NextResponse.json({ error: gate.reason }, { status: 451 });

  let body: { wallet?: string; legs?: { mint?: string; usdcAtoms?: string }[]; planMints?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected wallet, legs and planMints as JSON." }, { status: 400 });
  }
  if (!body.wallet || !Array.isArray(body.legs) || body.legs.length === 0 ||
      body.legs.some((leg) => !leg.mint || !leg.usdcAtoms || !/^\d+$/.test(leg.usdcAtoms))) {
    return NextResponse.json({ error: "Every Allocation leg needs mint and usdcAtoms as a string of digits." }, { status: 400 });
  }
  if (!Array.isArray(body.planMints) || body.planMints.length === 0 || !body.planMints.every((mint) => typeof mint === "string")) {
    return NextResponse.json({ error: "Expected planMints as a non-empty array of strings." }, { status: 400 });
  }

  try {
    return NextResponse.json(await prepareBatch(
      configured.config,
      body.wallet,
      body.legs.map((leg) => ({ mint: leg.mint!, inAtoms: BigInt(leg.usdcAtoms!) })),
      body.planMints,
    ));
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preparing the Allocation failed." }, { status: 500 });
  }
}
