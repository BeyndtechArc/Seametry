import "server-only";
import { createHmac } from "node:crypto";
import { Keypair } from "@solana/web3.js";

/**
 * Deterministically derives the mock issuer authority for one alloy id, from
 * one server-only secret, HALL_DEMO_ISSUER_SEED.
 *
 * chain/tools/devnet-demo generates this key fresh with Keypair::new() and
 * discards it when the process exits; nothing persists it anywhere (confirmed
 * by reading chain/tools/devnet-demo/src/main.rs in full before this build
 * started). A Vercel route handler is stateless between invocations, so a
 * later request for the same alloy (the issuer freezing, then thawing) cannot
 * recover an in-memory key generated on an earlier request. Deriving it from
 * the alloy id instead needs no database: the same id always yields the same
 * key, on any instance, with nothing written down.
 *
 * This is the "local signer only for demo" choice the task offered, over a
 * second wallet the presenter would need to hold and switch to mid-flow.
 */
export function deriveIssuer(allocId: bigint): Keypair {
  const seed = process.env.HALL_DEMO_ISSUER_SEED;
  if (!seed) {
    throw new Error(
      "HALL_DEMO_ISSUER_SEED is not set. Generate one (32+ random bytes, base64) and set it as a server-only environment variable; never NEXT_PUBLIC_."
    );
  }
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(allocId);
  const material = createHmac("sha256", seed).update("hall-demo-issuer").update(idBytes).digest();
  return Keypair.fromSeed(material);
}
