import { NextRequest, NextResponse } from "next/server";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { submitLeg } from "@/lib/allocation/execution";
import { Refusal } from "@/lib/refusal";
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
    if (error instanceof Refusal) {
      const changed = error.status === 409 && error.message.startsWith("The transaction was changed after it was approved");
      // Validation and expiry refusals happen before sendRawTransaction. A
      // caller may safely prepare them again; an RPC refusal remains
      // uncertain because the RPC can lose its response after broadcast.
      const definitelyNotSent = error.status === 400 || error.status === 409 || error.status === 410;
      return NextResponse.json({ error: error.message, ...(changed ? { code: "SIGNED_MESSAGE_CHANGED" } : {}), ...(definitelyNotSent ? { sent: false } : {}) }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sending the leg failed." }, { status: 500 });
  }
}
