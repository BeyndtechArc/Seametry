import type { Page } from "@playwright/test";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

export const TEST_WALLET = "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d";

export type ChainAnswer = { phase: "sent" | "landed" | "failed" | "dropped"; technical?: string; changes?: { mint: string; atoms: string; scale: number }[] };

/**
 * A prepared leg as /api/allocation/prepare-batch and /sell/prepare return
 * it, around an empty transaction the test wallet can sign. Each call builds
 * its own blockhash, so legs signed together carry distinct signatures.
 */
export function preparedLeg(overrides: Record<string, unknown> = {}) {
  const transaction = new VersionedTransaction(new TransactionMessage({ payerKey: new PublicKey(TEST_WALLET), recentBlockhash: Keypair.generate().publicKey.toBase58(), instructions: [] }).compileToV0Message());
  return {
    mint: "unset", symbol: "unset",
    transaction: Buffer.from(transaction.serialize()).toString("base64"), approval: "test-approval",
    expiresAt: new Date(Date.now() + 60_000).toISOString(), receivedAt: new Date().toISOString(),
    inAtoms: "1000000", inScale: 6, outAtoms: "1", floorAtoms: "1", outScale: 6, lastValidBlockHeight: 1_000, landing: "rpc", tipLamports: "0",
    routingFeeBps: 20, routingFeeAtoms: "2000", priorityFeeLamports: "0", route: ["Test route"], contextSlot: 1, simulated: [],
    ...overrides,
  };
}

/** Answers the watcher's batch status route, leg by leg, and counts what it was asked. */
export async function answerChain(page: Page, answer: (leg: { signature: string; wallet: string; signedAt: string; lastValidBlockHeight?: number }) => ChainAnswer | { status: number }) {
  const asked: { signature: string; lastValidBlockHeight?: number }[] = [];
  await page.route("**/api/execution/status", async (route) => {
    const { legs } = route.request().postDataJSON() as { legs: { signature: string; wallet: string; signedAt: string; lastValidBlockHeight?: number }[] };
    asked.push(...legs);
    const answers = legs.map(answer);
    const failure = answers.find((entry): entry is { status: number } => "status" in entry);
    if (failure) return route.fulfill({ status: failure.status, json: { error: "Mainnet could not be read: 429 Too Many Requests" } });
    await route.fulfill({ json: { legs: legs.map((leg, index) => ({ signature: leg.signature, ...(answers[index] as ChainAnswer) })) } });
  });
  return asked;
}

/** The submit route answering as the server does: the signature of the transaction it was sent. */
export async function acceptSubmits(page: Page) {
  let count = 0;
  await page.route("**/api/allocation/submit", (route) => {
    count += 1;
    return route.fulfill({ json: { signature: "answered" } });
  });
  return () => count;
}
