import { NextRequest, NextResponse } from "next/server";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { Refusal, submitLeg } from "@/lib/allocation/execution";
import { countryGate } from "@/lib/allocation/rules";

/** Sends a leg the holder signed, only if it is exactly the one approved and its quote has not expired. */
export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  }
  const gate = countryGate(requestCountry(request.headers), configured.config.blockedCountries);
  if (!gate.open) return NextResponse.json({ error: gate.reason }, { status: 451 });

  let body: { transaction?: string; approval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with transaction and approval." }, { status: 400 });
  }
  if (!body.transaction || !body.approval) {
    return NextResponse.json({ error: "Expected transaction (the signed transaction, base64) and approval." }, { status: 400 });
  }

  try {
    return NextResponse.json({ signature: await submitLeg(configured.config, body.transaction, body.approval) });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sending the leg failed." }, { status: 500 });
  }
}
