import type { components } from "@seametry/api-types";
import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { messageDigest } from "./allocation/approval";
import type { PreparedLeg } from "./allocation/execution";

// The bodies Execution's activity record accepts (contracts/openapi/
// openapi.yaml, tag activity), built from what the routes already hold.
// Pure, so the shape is tested without a Gateway (tests/activity.spec.ts);
// lib/activity.ts sends them.

export type ActivityQuote = components["schemas"]["ActivityQuote"];
export type ActivitySubmission = components["schemas"]["ActivitySubmission"];
export type FirstTouch = components["schemas"]["ActivityFirstTouch"];
type Deployment = ActivityQuote["deployment"];

const FIRST_TOUCH_LIMITS: Record<keyof FirstTouch, number> = {
  referrer_host: 255, landing_path: 500, utm_source: 200, utm_medium: 200, utm_campaign: 200, utm_content: 200, utm_term: 200,
};

/**
 * What a browser sent as its first touch, kept only where it is a string and
 * cut to the record's limits, so a malformed or oversized field costs that
 * field, never the whole report.
 */
export function firstTouchFrom(value: unknown): FirstTouch | undefined {
  if (!value || typeof value !== "object") return undefined;
  const touch: FirstTouch = {};
  for (const [field, limit] of Object.entries(FIRST_TOUCH_LIMITS) as [keyof FirstTouch, number][]) {
    const raw = (value as Record<string, unknown>)[field];
    if (typeof raw === "string" && raw.trim()) touch[field] = raw.trim().slice(0, limit);
  }
  return Object.keys(touch).length > 0 ? touch : undefined;
}

/** Vercel names the deployment; anything else is a local or test run. */
export function deployment(vercelEnv: string | undefined): Deployment {
  return vercelEnv === "production" || vercelEnv === "preview" ? vercelEnv : "development";
}

/** The digest an approval binds, from the base64 transaction the route returned or received. */
export function transactionDigest(base64: string): string {
  return messageDigest(VersionedTransaction.deserialize(Buffer.from(base64, "base64")).message.serialize());
}

export function quoteReport({ id, wallet, kind, subject, templateId, planSize, firstTouch, preparedAt, deploymentName, legs, refusal }: {
  id: string;
  wallet: string;
  kind: "buy" | "sell";
  subject?: string;
  templateId?: string;
  planSize: number;
  firstTouch?: FirstTouch;
  preparedAt: Date;
  deploymentName: Deployment;
  legs: (PreparedLeg & { id: string })[];
  refusal?: { status: number; text: string };
}): ActivityQuote {
  return {
    id, wallet, network: "mainnet", kind, plan_size: planSize, deployment: deploymentName, prepared_at: preparedAt.toISOString(),
    ...(subject ? { subject: subject.slice(0, 200) } : {}),
    ...(templateId ? { template_id: templateId.slice(0, 200) } : {}),
    ...(firstTouch ? { first_touch: firstTouch } : {}),
    ...(refusal ? { refusal: { status: refusal.status, text: refusal.text.slice(0, 2000) } } : {}),
    legs: refusal ? [] : legs.map((leg) => ({
      id: leg.id,
      mint: leg.mint,
      symbol: leg.symbol.slice(0, 40),
      in: { atoms: leg.inAtoms, scale: leg.inScale },
      out: { atoms: leg.outAtoms, scale: leg.outScale },
      floor: { atoms: leg.floorAtoms, scale: leg.outScale },
      routing_fee_bps: leg.routingFeeBps,
      tip_offset_bps: leg.tipOffsetBps,
      simulated_fee_atoms: leg.routingFeeAtoms,
      tip_lamports: leg.tipLamports,
      landing: leg.landing,
      last_valid_block_height: leg.lastValidBlockHeight,
      message_sha256: transactionDigest(leg.transaction),
    })),
  };
}

/**
 * What submit did with a signed leg. sent:false refusals reached nothing;
 * any other failure may have been broadcast, so it is uncertain, the same
 * reading the submit route gives the browser.
 */
/**
 * The leg is named by the message its approval bound, the one the quote
 * report recorded; a wallet's guard instructions change the signed message
 * but not which leg it is. The signature is the signed transaction's, the one
 * the chain will know.
 */
export function submissionReport(signedBase64: string, approvedBase64: string, submittedAt: Date, outcome: { sent: true } | { sent: false; definitelyNotSent: boolean; text: string }): ActivitySubmission | undefined {
  let transaction: VersionedTransaction;
  let approved: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
    approved = VersionedTransaction.deserialize(Buffer.from(approvedBase64, "base64"));
  } catch {
    return undefined;
  }
  const first = transaction.signatures[0];
  const signed = first && first.some((byte) => byte !== 0);
  return {
    message_sha256: messageDigest(approved.message.serialize()),
    submitted_at: submittedAt.toISOString(),
    ...(signed ? { signature: bs58.encode(first) } : {}),
    ...(outcome.sent
      ? { result: "sent" as const }
      : { result: outcome.definitelyNotSent ? "refused_not_sent" as const : "uncertain" as const, text: outcome.text.slice(0, 2000) }),
  };
}
