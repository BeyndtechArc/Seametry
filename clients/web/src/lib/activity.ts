import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { deployment, firstTouchFrom, quoteReport, type ActivityQuote, type ActivitySubmission } from "./activity-report";
import type { PreparedLeg } from "./allocation/execution";
import { postInternal } from "./internal-gateway";

// Sends activity reports to Execution's record on the Go Gateway, after the
// response, so recording never delays or fails a trade. One retry covers a
// dropped connection; a report still lost is logged by path and status and
// is gone, which the plan accepts: the trade itself is on chain either way
// (.plan/activity-record-and-admin.plan.md, Ingestion).

export const currentDeployment = deployment(process.env.VERCEL_ENV);

async function send(path: string, body: unknown) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await postInternal(`activity/${path}`, body);
      if (!response || response.ok) return;
      // A refused report will be refused again; only the Gateway's own failures are retried.
      if (response.status < 500) {
        console.warn(`Activity report ${path} refused with ${response.status}: ${(await response.text()).slice(0, 300)}`);
        return;
      }
      if (attempt === 1) console.warn(`Activity report ${path} lost: the Gateway answered ${response.status} twice.`);
    } catch (error) {
      if (attempt === 1) console.warn(`Activity report ${path} lost: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
}

/**
 * Reports one prepare request: the legs it returned, or the refusal that
 * stopped it. A request whose wallet is not an address names nobody, so it
 * is not reported.
 */
export function recordPrepared({ quoteId, wallet, kind, body, planSize, legs, refusal }: {
  quoteId: string;
  wallet: unknown;
  kind: "buy" | "sell";
  body: { subject?: unknown; templateId?: unknown; firstTouch?: unknown };
  planSize: number;
  legs?: PreparedLeg[];
  refusal?: { status: number; text: string };
}) {
  if (typeof wallet !== "string") return;
  try {
    new PublicKey(wallet);
  } catch {
    return;
  }
  const report: ActivityQuote = quoteReport({
    id: quoteId, wallet, kind, planSize: Math.max(1, planSize), preparedAt: new Date(), deploymentName: currentDeployment,
    subject: typeof body.subject === "string" ? body.subject : undefined,
    templateId: typeof body.templateId === "string" ? body.templateId : undefined,
    firstTouch: firstTouchFrom(body.firstTouch),
    legs: (legs ?? []).map((leg) => ({ ...leg, id: randomUUID() })),
    refusal,
  });
  after(() => send("quotes", report));
}

export function recordSubmission(report: ActivitySubmission | undefined) {
  if (report) after(() => send("submissions", report));
}

export function recordFunnel(events: { kind: string; wallet?: string; quote_id?: string }[]) {
  after(() => send("funnel", { deployment: currentDeployment, events }));
}
