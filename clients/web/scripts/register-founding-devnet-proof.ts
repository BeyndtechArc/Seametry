/**
 * Founds a six-leg Alloy on real devnet through the same code the Compose
 * founding runs: prepareFounding (src/lib/compose/founding-prepare.ts) and
 * buildFoundingTransaction (src/lib/compose/founding-transaction.ts),
 * unmodified, with a fresh Keypair signing where the sponsor's wallet would.
 * It prints the transaction's size, the compute it consumed and the
 * lamports the sponsor spent, the three things a six-leg founding could run
 * out of.
 *
 * It founds on the scratch Hall by default, so proving the flow adds nothing
 * to the register; pass --hall register to found on the register's Hall.
 *
 * Run (from clients/web):
 *   npx tsx --env-file=.env.local scripts/register-founding-devnet-proof.ts
 * Needs HALL_DEMO_FUNDER_SECRET_KEY and HALL_DEMO_ISSUER_SEED in .env.local.
 */
import { createHmac } from "node:crypto";
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { SCRATCH_HALL_PROGRAM_ID, DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";
import { hallProgram } from "../src/lib/hall/program";
import { KeypairWallet } from "../src/lib/hall/keypair-wallet";
import { prepareFounding, type FoundingLeg } from "../src/lib/compose/founding-prepare";
import { buildFoundingTransaction } from "../src/lib/compose/founding-transaction";

// env.ts and issuer.ts carry `import "server-only"`, which throws outside
// Next's bundler; only the key
// loading is repeated here, with the same derivation label as standInIssuer.
function funderKey(): Keypair {
  const raw = process.env.HALL_DEMO_FUNDER_SECRET_KEY;
  if (!raw) throw new Error("HALL_DEMO_FUNDER_SECRET_KEY is not set (see clients/web/README.md)");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}
function standInIssuer(): Keypair {
  const seed = process.env.HALL_DEMO_ISSUER_SEED;
  if (!seed) throw new Error("HALL_DEMO_ISSUER_SEED is not set (see clients/web/README.md)");
  return Keypair.fromSeed(createHmac("sha256", seed).update("register-stand-in-issuer").digest());
}

// Stoic Crew's six legs at the 5 October 2026 17:05 UTC draft quantities
// (equal value, 100 USDC a share across five; NVDAx at a comparable size),
// all at the xStocks' eight decimals. The proof exercises the shape; the
// founding itself takes its quantities from Compose.
const legs: FoundingLeg[] = [
  { symbol: "AAPLx", realMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, atomsPerShare: 5_956_730n },
  { symbol: "MSFTx", realMint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", decimals: 8, atomsPerShare: 3_781_227n },
  { symbol: "GOOGLx", realMint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", decimals: 8, atomsPerShare: 5_772_688n },
  { symbol: "AMZNx", realMint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", decimals: 8, atomsPerShare: 7_895_451n },
  { symbol: "METAx", realMint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", decimals: 8, atomsPerShare: 2_676_982n },
  { symbol: "NVDAx", realMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", decimals: 8, atomsPerShare: 3_532_920n },
];

async function main() {
  const hall = process.argv.includes("--hall") && process.argv[process.argv.indexOf("--hall") + 1] === "register" ? REGISTER_HALL_PROGRAM_ID : SCRATCH_HALL_PROGRAM_ID;
  const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
  const sponsor = Keypair.generate();
  console.log("hall", hall.toBase58(), "sponsor", sponsor.publicKey.toBase58());

  const prepared = await prepareFounding(connection, funderKey(), standInIssuer(), hall, sponsor.publicKey, legs);
  console.log("prepared", JSON.stringify(prepared, null, 2));

  // A lookup table is usable from the slot after it was extended.
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const before = await connection.getBalance(sponsor.publicKey, "confirmed");
  const provider = new AnchorProvider(connection, new KeypairWallet(sponsor), { commitment: "confirmed" });
  const transaction = await buildFoundingTransaction(connection, hallProgram(provider, hall), prepared, {
    name: "Stoic Crew proof",
    symbol: "PROOF",
    uri: "https://www.seametry.xyz/alloys/stoic-crew/metadata.json",
  });
  transaction.sign([sponsor]);
  console.log("transaction bytes", transaction.serialize().length, "of 1232");
  const signature = await connection.sendTransaction(transaction);
  await connection.confirmTransaction(signature, "confirmed");
  const result = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const after = await connection.getBalance(sponsor.publicKey, "confirmed");
  console.log("initialize_alloy", signature);
  console.log("compute units consumed", result?.meta?.computeUnitsConsumed, "error", result?.meta?.err ?? "none");
  console.log("sponsor spent lamports", before - after);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
