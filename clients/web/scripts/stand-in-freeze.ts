/**
 * Freezes or thaws the Hall's own account for one register stand-in on one
 * Alloy, as the stand-ins' mock issuer: the devnet condition the Alloy page
 * reads as a held-back leg. Strike is then refused on chain and a Melt
 * delivers every other leg, leaving this one in the holder's Claim until a
 * thaw. Only that one token account changes; the same stand-in held by another
 * Alloy, or by any wallet, is untouched.
 *
 * Shares must be struck before a freeze, because a frozen leg refuses every
 * Strike; the script lists who holds shares so that is visible first.
 *
 * Run (from clients/web):
 *   npx tsx --env-file=.env.local scripts/stand-in-freeze.ts <alloy> <stand-in mint> freeze|thaw
 */
import { createHmac } from "node:crypto";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createFreezeAccountInstruction,
  createThawAccountInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "../src/lib/hall/constants";
import { hallTokenAccount, lockedSharesPda, shareMintPda } from "../src/lib/hall/pda";

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

const stateName = (frozen: boolean) => (frozen ? "frozen" : "initialized");

async function main() {
  const [alloyArg, mintArg, action] = process.argv.slice(2);
  if (!alloyArg || !mintArg || (action !== "freeze" && action !== "thaw")) {
    throw new Error(`Expected <alloy> <stand-in mint> freeze|thaw, got ${JSON.stringify(process.argv.slice(2))}.`);
  }
  const alloy = new PublicKey(alloyArg);
  const mint = new PublicKey(mintArg);
  const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
  const issuer = standInIssuer();
  const funder = funderKey();

  const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (!mintInfo.freezeAuthority?.equals(issuer.publicKey)) {
    throw new Error(`Mint ${mint.toBase58()} has freeze authority ${mintInfo.freezeAuthority?.toBase58() ?? "none"}, not the stand-in issuer ${issuer.publicKey.toBase58()}, so this script cannot freeze it. Only register stand-ins can be frozen here.`);
  }
  const account = hallTokenAccount(alloy, mint);
  const before = await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (!before.owner.equals(alloy)) {
    throw new Error(`Token account ${account.toBase58()} is owned by ${before.owner.toBase58()}, not the Alloy ${alloy.toBase58()}.`);
  }
  console.log(`alloy ${alloy.toBase58()}\nmint ${mint.toBase58()}\nhall account ${account.toBase58()} (${stateName(before.isFrozen)})`);

  // What can still be Melted once the leg is frozen: supply less the locked
  // genesis. Listing holders (getTokenLargestAccounts) is rate limited on
  // public devnet RPC to the point of failing, so this reads two balances.
  const shares = await getMint(connection, shareMintPda(REGISTER_HALL_PROGRAM_ID, alloy), "confirmed", TOKEN_2022_PROGRAM_ID);
  const locked = await connection.getTokenAccountBalance(lockedSharesPda(REGISTER_HALL_PROGRAM_ID, alloy), "confirmed");
  const outside = shares.supply - BigInt(locked.value.amount);
  console.log(`share atoms outside the locked genesis: ${outside} (scale ${shares.decimals})${outside === 0n ? "; nobody can Melt this Alloy yet" : ""}`);

  if ((action === "freeze") === before.isFrozen) {
    console.log(`already ${stateName(before.isFrozen)}; nothing sent`);
    return;
  }
  const instruction = action === "freeze"
    ? createFreezeAccountInstruction(account, mint, issuer.publicKey, [], TOKEN_2022_PROGRAM_ID)
    : createThawAccountInstruction(account, mint, issuer.publicKey, [], TOKEN_2022_PROGRAM_ID);
  const transaction = new Transaction().add(instruction);
  transaction.feePayer = funder.publicKey;
  const signature = await sendAndConfirmTransaction(connection, transaction, [funder, issuer], { commitment: "confirmed" });
  const after = await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (after.isFrozen !== (action === "freeze")) {
    throw new Error(`Sent ${signature}, but the account now reads ${stateName(after.isFrozen)}, not ${stateName(action === "freeze")}.`);
  }
  console.log(`${action} ${signature}\nhttps://explorer.solana.com/tx/${signature}?cluster=devnet\nhall account now ${stateName(after.isFrozen)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
