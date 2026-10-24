import { NextRequest, NextResponse } from "next/server";
import { recordSubmission } from "@/lib/activity";
import { submissionReport } from "@/lib/activity-report";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { submitLeg } from "@/lib/allocation/execution";
import { Refusal } from "@/lib/refusal";
import { countryGate } from "@/lib/allocation/rules";

/** Sends a leg the holder signed, only if its trade is exactly the one approved and its quote has not expired. */
export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  }
  const gate = countryGate(requestCountry(request.headers), configured.config.blockedCountries);
  if (!gate.open) return NextResponse.json({ error: gate.reason }, { status: 451 });

  let body: { transaction?: string; approved?: string; approval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with transaction, approved and approval." }, { status: 400 });
  }
  if (!body.transaction || !body.approved || !body.approval) {
    return NextResponse.json({ error: "Expected transaction (the signed transaction, base64), approved (the transaction as prepared, base64) and approval." }, { status: 400 });
  }
  const { transaction, approved, approval } = body;

  const submittedAt = new Date();
  try {
    const signature = await submitLeg(configured.config, transaction, approved, approval);
    recordSubmission(submissionReport(transaction, approved, submittedAt, { sent: true }));
    return NextResponse.json({ signature });
  } catch (error) {
    if (error instanceof Refusal) {
      const changed = error.status === 409 && error.message.startsWith("The transaction was changed after it was approved");
      // Validation and expiry refusals happen before sendRawTransaction, and a
      // preflight refusal before broadcast, so the caller may prepare them
      // again; any other RPC failure stays uncertain, because the RPC can
      // lose its response after broadcast.
      const definitelyNotSent = error.status === 400 || error.status === 409 || error.status === 410 || error.detail.notSent === true;
      // A wallet's change to an approved leg is reported against that leg, so
      // the team can read what the wallet changed; a transaction naming no
      // approved leg has nothing to be reported against.
      if (!error.detail.unknownLeg) recordSubmission(submissionReport(transaction, approved, submittedAt, { sent: false, definitelyNotSent, text: error.message }));
      return NextResponse.json({
        error: error.message,
        ...(changed ? { code: "SIGNED_MESSAGE_CHANGED" } : {}),
        ...(definitelyNotSent ? { sent: false } : {}),
        ...(error.detail.technical ? { technical: error.detail.technical } : {}),
      }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Sending the leg failed.";
    recordSubmission(submissionReport(transaction, approved, submittedAt, { sent: false, definitelyNotSent: false, text: message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
