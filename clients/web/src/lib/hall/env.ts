import "server-only";
import { Keypair } from "@solana/web3.js";

/**
 * The fee payer for every server-built transaction in this demo: mock stock
 * creation, initialize_alloy's rent, and the ATAs it opens for the connected
 * wallet. Deliberately not the deployer keypair that holds the Hall
 * program's upgrade authority (~/.config/solana/seametry-devnet-deployer.json):
 * a public-facing route handler signing with that key would put a much
 * larger blast radius behind one leaked environment variable than a small,
 * dedicated, bounded-balance key needs to carry. Generated fresh for this
 * build and funded with 1 SOL from the deployer on devnet (see the commit
 * that added this file for the signature).
 */
export function demoFunder(): Keypair {
  const raw = process.env.HALL_DEMO_FUNDER_SECRET_KEY;
  if (!raw) {
    throw new Error(
      "HALL_DEMO_FUNDER_SECRET_KEY is not set. See clients/web/README.md for how to generate and fund a demo key; never commit the value."
    );
  }
  let bytes: number[];
  try {
    bytes = JSON.parse(raw);
  } catch {
    throw new Error("HALL_DEMO_FUNDER_SECRET_KEY is not valid JSON (expected a byte array).");
  }
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}
