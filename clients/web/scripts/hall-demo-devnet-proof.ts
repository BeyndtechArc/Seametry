/**
 * Drives the seven-step /hall-demo flow against real devnet, calling the
 * exact shared library code the browser runs (src/lib/hall/*, unmodified,
 * not a reimplementation) with a real Keypair standing in for the connected
 * wallet's signTransaction. What this does not exercise: an actual browser
 * click sequence through flow.tsx's buttons with a real or mocked wallet
 * extension. tests/csp.spec.ts already proves /hall-demo loads under the
 * real CSP with no violation and no console error; this proves the logic
 * those buttons call produces the right on-chain result, with real
 * signatures, end to end. Both together are the two things that can go
 * wrong; neither alone would have caught both HALL_DEMO_FUNDER_SECRET_KEY
 * needing !.env.local to reach this script and the actual account-shape
 * bugs this run found (see the commit this script shipped in).
 *
 * Run (from clients/web):
 *   npx tsx --env-file=.env.local scripts/hall-demo-devnet-proof.ts
 * Needs .env.local (HALL_DEMO_FUNDER_SECRET_KEY, HALL_DEMO_ISSUER_SEED) and
 * a devnet-funded holder keypair path as argv[2] (defaults to
 * ~/.config/solana/seametry-devnet-demo-holder.json). Node's own
 * --env-file loads .env.local; no dotenv dependency needed.
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { foundAlloyFor } from "../src/lib/hall/found";
import { freezeLeg, thawLeg } from "../src/lib/hall/issuer-actions";
import { claimPda, hallTokenAccount, ownerTokenAccount } from "../src/lib/hall/pda";
import { decodeAlloy, requiredIn } from "../src/lib/hall/decode";
import { fetchClaim, hallProgram } from "../src/lib/hall/program";
import { KeypairWallet } from "../src/lib/hall/keypair-wallet";
import { DEMO_HALL_PROGRAM_ID, DEVNET_RPC_ENDPOINT } from "../src/lib/hall/constants";

const STRIKE_SHARES = 100_000n;
const holderPath = process.argv[2] ?? join(homedir(), ".config", "solana", "seametry-devnet-demo-holder.json");
const holder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(holderPath, "utf8"))));

// src/lib/hall/env.ts and issuer.ts carry `import "server-only"`, which
// throws unconditionally outside Next's own bundler (Next replaces the
// import with a no-op at build time; there is no such replacement under
// plain Node, so the package's own code always throws there, by design).
// The transaction-building logic itself (found.ts, issuer-actions.ts,
// pda.ts, decode.ts, program.ts, keypair-wallet.ts) carries no such guard
// and is imported unmodified above; only this key-loading duplicates those
// two small guarded files, so the guard can stay in place for the real app.
function demoFunder(): Keypair {
  const raw = process.env.HALL_DEMO_FUNDER_SECRET_KEY;
  if (!raw) throw new Error("HALL_DEMO_FUNDER_SECRET_KEY is not set (see clients/web/README.md)");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}
function deriveIssuer(allocId: bigint): Keypair {
  const seed = process.env.HALL_DEMO_ISSUER_SEED;
  if (!seed) throw new Error("HALL_DEMO_ISSUER_SEED is not set (see clients/web/README.md)");
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(allocId);
  const material = createHmac("sha256", seed).update("hall-demo-issuer").update(idBytes).digest();
  return Keypair.fromSeed(material);
}

const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
const funder = demoFunder();

const log: Record<string, unknown> = { holder: holder.publicKey.toBase58(), funder: funder.publicKey.toBase58() };

async function main() {
  const allocId = BigInt(Date.now());
  console.log("1. Founding alloy", allocId.toString(), "for holder", holder.publicKey.toBase58());
  const issuer = deriveIssuer(allocId);
  const founded = await foundAlloyFor(connection, funder, issuer, allocId, holder.publicKey);
  log.founded = founded;
  console.log("   alloy", founded.alloy, "signatures", founded.signatures);

  const alloy = new PublicKey(founded.alloy);
  const shareMint = new PublicKey(founded.shareMint);
  const provider = new AnchorProvider(connection, new KeypairWallet(holder), { commitment: "confirmed" });
  const program = hallProgram(provider, DEMO_HALL_PROGRAM_ID);

  console.log("2. Reading the alloy from chain");
  let info = await connection.getAccountInfo(alloy, "confirmed");
  if (!info) throw new Error("alloy account not found right after founding");
  let state = decodeAlloy(info.data);
  console.log("   supply", state.supply.toString(), "legs", state.legs.map((l) => l.ledger.toString()));

  console.log("3. Strike:", STRIKE_SHARES.toString(), "shares, required_in computed from the live ledger");
  const callerShares = ownerTokenAccount(holder.publicKey, shareMint);
  const maximums = state.legs.map((leg) => new BN(requiredIn(leg.ledger, STRIKE_SHARES, state.supply).toString()));
  const remainingAccounts = founded.stocks.flatMap((s) => {
    const mint = new PublicKey(s.mint);
    return [
      { pubkey: mint, isWritable: false, isSigner: false },
      { pubkey: new PublicKey(s.holderAccount), isWritable: true, isSigner: false },
      { pubkey: hallTokenAccount(alloy, mint), isWritable: true, isSigner: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false },
    ];
  });
  const strikeSig = await program.methods
    .create(new BN(STRIKE_SHARES.toString()), maximums)
    .accounts({
      caller: holder.publicKey,
      alloy,
      shareMint,
      callerShares,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .remainingAccounts(remainingAccounts)
    .signers([holder])
    .rpc({ commitment: "confirmed" });
  log.strikeSig = strikeSig;
  console.log("   ok", strikeSig);

  console.log("4. The Office freezes leg", founded.stocks[0].label);
  const freezeSig = await freezeLeg(connection, funder, issuer, alloy, new PublicKey(founded.stocks[0].mint));
  log.freezeSig = freezeSig;
  console.log("   ok", freezeSig);

  console.log("5. Melt: redeem", STRIKE_SHARES.toString(), "shares");
  const claim = claimPda(DEMO_HALL_PROGRAM_ID, alloy, holder.publicKey);
  const redeemAccounts = founded.stocks.map((s) => ({ pubkey: hallTokenAccount(alloy, new PublicKey(s.mint)), isWritable: false, isSigner: false }));
  const redeemSig = await program.methods
    .redeem(new BN(STRIKE_SHARES.toString()))
    .accounts({
      caller: holder.publicKey,
      alloy,
      shareMint,
      callerShares,
      claim,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: PublicKey.default,
    })
    .remainingAccounts(redeemAccounts)
    .signers([holder])
    .rpc({ commitment: "confirmed" });
  log.redeemSig = redeemSig;
  console.log("   ok", redeemSig);

  const claimAccount = await fetchClaim(program, claim);
  if (!claimAccount) throw new Error("claim account not found right after redeem");
  const entries = claimAccount.entries;
  console.log("   claim entries", entries.slice(0, 2).map((e) => e.units.toString()));

  console.log("6. Withdraw each leg: leg 0 (frozen) must refuse, leg 1 must deliver");
  const results: Record<string, string> = {};
  for (let i = 0; i < 2; i++) {
    const units = entries[i].units;
    const mint = new PublicKey(founded.stocks[i].mint);
    try {
      const sig = await program.methods
        .withdraw(i, units)
        .accounts({
          owner: holder.publicKey,
          alloy,
          claim,
          mint,
          hallAccount: hallTokenAccount(alloy, mint),
          destination: new PublicKey(founded.stocks[i].holderAccount),
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([holder])
        .rpc({ commitment: "confirmed" });
      results[`withdraw_leg_${i}`] = `ok ${sig}`;
      console.log(`   leg ${i} (${founded.stocks[i].label}) delivered:`, sig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results[`withdraw_leg_${i}`] = `refused: ${message}`;
      console.log(`   leg ${i} (${founded.stocks[i].label}) refused, as expected while frozen:`, message.slice(0, 200));
    }
  }
  log.withdrawResults = results;
  if (!results.withdraw_leg_0.startsWith("refused")) throw new Error("leg 0 was expected to refuse while frozen, and did not");
  if (!results.withdraw_leg_1.startsWith("ok")) throw new Error("leg 1 was expected to deliver, and did not");

  console.log("7. The Office releases leg", founded.stocks[0].label, "then withdraw the remaining claim");
  const thawSig = await thawLeg(connection, funder, issuer, alloy, new PublicKey(founded.stocks[0].mint));
  log.thawSig = thawSig;
  console.log("   ok", thawSig);

  const finalWithdrawSig = await program.methods
    .withdraw(0, entries[0].units)
    .accounts({
      owner: holder.publicKey,
      alloy,
      claim,
      mint: new PublicKey(founded.stocks[0].mint),
      hallAccount: hallTokenAccount(alloy, new PublicKey(founded.stocks[0].mint)),
      destination: new PublicKey(founded.stocks[0].holderAccount),
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    })
    .signers([holder])
    .rpc({ commitment: "confirmed" });
  log.finalWithdrawSig = finalWithdrawSig;
  console.log("   ok, the previously held leg is delivered:", finalWithdrawSig);

  info = await connection.getAccountInfo(alloy, "confirmed");
  state = decodeAlloy(info!.data);
  log.finalAlloyState = state.legs.map((l) => ({ ledger: l.ledger.toString(), unclaimed: l.unclaimed.toString() }));
  console.log("\nAll seven steps completed on devnet.");
  console.log(JSON.stringify(log, null, 2));
}

main().catch((error) => {
  console.error("\nFAILED:", error);
  console.error(JSON.stringify(log, null, 2));
  process.exit(1);
});
