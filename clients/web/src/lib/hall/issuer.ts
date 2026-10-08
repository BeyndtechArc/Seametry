import "server-only";
import { createHmac } from "node:crypto";
import { Keypair } from "@solana/web3.js";

/**
 * The mock issuer of the devnet stand-ins for real xStocks in Alloys founded
 * on the register's Hall. One authority for all of them, derived from the
 * same seed under its own label, so the stand-ins can later be frozen or
 * released the way a real issuer could, without a key ever being stored.
 */
export function standInIssuer(): Keypair {
  return Keypair.fromSeed(createHmac("sha256", issuerSeed()).update("register-stand-in-issuer").digest());
}

function issuerSeed(): string {
  const seed = process.env.HALL_DEMO_ISSUER_SEED;
  if (!seed) {
    throw new Error(
      "HALL_DEMO_ISSUER_SEED is not set. Generate one (32+ random bytes, base64) and set it as a server-only environment variable; never NEXT_PUBLIC_."
    );
  }
  return seed;
}
