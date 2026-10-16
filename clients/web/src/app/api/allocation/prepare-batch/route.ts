import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordPrepared } from "@/lib/activity";
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

  let body: { wallet?: string; legs?: { mint?: string; usdcAtoms?: string }[]; planMints?: unknown; subject?: unknown; templateId?: unknown; firstTouch?: unknown };
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

  const quoteId = randomUUID();
  const reported = { quoteId, wallet: body.wallet, kind: "buy" as const, body, planSize: body.planMints.length };
  try {
    const legs = await prepareBatch(
      configured.config,
      body.wallet,
      body.legs.map((leg) => ({ mint: leg.mint!, inAtoms: BigInt(leg.usdcAtoms!) })),
      body.planMints,
    );
    recordPrepared({ ...reported, legs });
    return NextResponse.json(legs.map((leg) => ({ ...leg, quoteId })));
  } catch (error) {
    const status = error instanceof Refusal ? error.status : 500;
    const message = error instanceof Error ? error.message : "Preparing the Allocation failed.";
    recordPrepared({ ...reported, refusal: { status, text: message } });
    return NextResponse.json({ error: message }, { status });
  }
}
