import { NextRequest, NextResponse } from "next/server";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { prepareSales } from "@/lib/allocation/execution";
import { countryGate } from "@/lib/allocation/rules";
import { Refusal } from "@/lib/refusal";

export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) return NextResponse.json({ error: `Selling is unavailable: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  const gate = countryGate(requestCountry(request.headers), configured.config.blockedCountries);
  if (!gate.open) return NextResponse.json({ error: gate.reason }, { status: 451 });
  let body: { wallet?: string; legs?: { mint?: string; atoms?: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Supply wallet and legs, each with mint and exact token atoms, as JSON." }, { status: 400 });
  }
  if (!body.wallet || !Array.isArray(body.legs) || body.legs.length === 0 || body.legs.some((leg) => !leg.mint || !leg.atoms || !/^\d+$/.test(leg.atoms))) {
    return NextResponse.json({ error: "Supply wallet and at least one leg, each with mint and atoms as a string of digits." }, { status: 400 });
  }
  try {
    return NextResponse.json(await prepareSales(configured.config, body.wallet, body.legs.map((leg) => ({ mint: leg.mint!, inAtoms: BigInt(leg.atoms!) }))));
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preparing the sale failed." }, { status: 500 });
  }
}
