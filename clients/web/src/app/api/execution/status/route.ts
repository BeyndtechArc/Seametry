import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { allocationConfig } from "@/lib/allocation/config";
import { readLegs, type LegQuery } from "@/lib/execution/chain";

// The watcher asks about every open leg in one request; more than this many
// open at once means something upstream is wrong, not a bigger page to read.
const MOST_LEGS = 32;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

function refusal(index: number, field: string, expected: string, received: unknown) {
  return NextResponse.json({ error: `legs[${index}].${field}: expected ${expected}, received ${JSON.stringify(received)}.` }, { status: 400 });
}

/** Where each signed leg stands on mainnet: sent, landed (with the wallet's token changes), failed, or dropped past its deadline. */
export async function POST(request: NextRequest) {
  const configured = allocationConfig();
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.` }, { status: 503 });
  }
  let body: { legs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body { legs: [{ signature, wallet, signedAt, lastValidBlockHeight? }] }." }, { status: 400 });
  }
  if (!Array.isArray(body.legs) || body.legs.length === 0 || body.legs.length > MOST_LEGS) {
    return NextResponse.json({ error: `Expected legs: an array of 1 to ${MOST_LEGS} entries.` }, { status: 400 });
  }
  const legs: LegQuery[] = [];
  for (const [index, entry] of (body.legs as Record<string, unknown>[]).entries()) {
    if (typeof entry?.signature !== "string" || !SIGNATURE.test(entry.signature)) return refusal(index, "signature", "a base58 transaction signature", entry?.signature);
    try {
      new PublicKey(entry.wallet as string);
    } catch {
      return refusal(index, "wallet", "a Solana address", entry.wallet);
    }
    if (typeof entry.signedAt !== "string" || Number.isNaN(Date.parse(entry.signedAt))) return refusal(index, "signedAt", "an ISO time", entry.signedAt);
    if (entry.lastValidBlockHeight !== undefined && !Number.isSafeInteger(entry.lastValidBlockHeight)) return refusal(index, "lastValidBlockHeight", "an integer block height", entry.lastValidBlockHeight);
    legs.push({ signature: entry.signature, wallet: entry.wallet as string, signedAt: entry.signedAt, ...(entry.lastValidBlockHeight !== undefined ? { lastValidBlockHeight: entry.lastValidBlockHeight as number } : {}) });
  }
  try {
    return NextResponse.json({ legs: await readLegs(configured.config.mainnetRpcUrl, legs, Date.now()) });
  } catch (error) {
    return NextResponse.json({ error: `Mainnet could not be read: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
