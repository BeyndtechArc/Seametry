/**
 * Strikes, melts and delivers one share of an Alloy on real devnet through
 * the same code the Alloy page runs: prepareStrike (src/lib/alloys/
 * strike-prepare.ts) and the builders in src/lib/alloys/hall-transactions.ts,
 * unmodified, with a fresh Keypair signing where the holder's wallet would.
 * It prints each transaction's size, compute and the holder's SOL spent.
 *
 * Point it at an Alloy on the demo's Hall whose legs are register stand-ins
 * (one founded by register-founding-devnet-proof.ts), so proving the flow
 * adds no activity to the register.
 *
 * Run (from clients/web):
 *   npx tsx --env-file=.env.local scripts/register-strike-melt-devnet-proof.ts <alloy> [--hall register]
 */
import { createHmac } from "node:crypto";
import { Connection, Keypair, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { DEMO_HALL_PROGRAM_ID, DEVNET_RPC_ENDPOINT, ONE_SHARE_ATOMS, REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";
import { hallProgram } from "../src/lib/hall/program";
import { KeypairWallet } from "../src/lib/hall/keypair-wallet";
import { prepareStrike } from "../src/lib/alloys/strike-prepare";
import { buildDelivery, buildMelt, buildStrike, readClaim } from "../src/lib/alloys/hall-transactions";
import { awaitLanding } from "../src/lib/landing";

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

async function main() {
  const alloy = new PublicKey(process.argv[2] ?? "");
  const hall = process.argv.includes("--hall") && process.argv[process.argv.indexOf("--hall") + 1] === "register" ? REGISTER_HALL_PROGRAM_ID : DEMO_HALL_PROGRAM_ID;
  const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
  const holder = Keypair.generate();
  const program = hallProgram(new AnchorProvider(connection, new KeypairWallet(holder), { commitment: "confirmed" }), hall);
  console.log("hall", hall.toBase58(), "alloy", alloy.toBase58(), "holder", holder.publicKey.toBase58());

  const prepared = await prepareStrike(connection, funderKey(), standInIssuer(), hall, alloy, holder.publicKey, ONE_SHARE_ATOMS);
  console.log("prepared", prepared.legs.map((leg) => `${leg.mint.slice(0, 6)} minted ${leg.minted}`).join(", "));

  const run = async (label: string, transaction: VersionedTransaction) => {
    const before = await connection.getBalance(holder.publicKey, "confirmed");
    transaction.sign([holder]);
    const bytes = transaction.serialize().length;
    const signature = await connection.sendTransaction(transaction);
    await awaitLanding(connection, signature, transaction.message.recentBlockhash);
    const result = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const after = await connection.getBalance(holder.publicKey, "confirmed");
    console.log(`${label}: ${signature} | ${bytes} bytes | ${result?.meta?.computeUnitsConsumed} compute units | error ${JSON.stringify(result?.meta?.err ?? null)} | holder spent ${before - after} lamports`);
  };

  await run("strike", await buildStrike(connection, program, alloy, holder.publicKey, ONE_SHARE_ATOMS));
  await run("melt", await buildMelt(connection, program, hall, alloy, holder.publicKey, ONE_SHARE_ATOMS));
  const claim = await readClaim(connection, program, hall, alloy, holder.publicKey);
  console.log("claim", claim.map((leg) => `${leg.index}:${leg.units}`).join(" "));
  for (const delivery of await buildDelivery(connection, program, hall, alloy, holder.publicKey, claim)) await run("deliver", delivery);
  console.log("claim after delivery", (await readClaim(connection, program, hall, alloy, holder.publicKey)).length, "legs outstanding");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
