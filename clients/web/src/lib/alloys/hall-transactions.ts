import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { BN, type Idl, type Program } from "@coral-xyz/anchor";
import { decodeAlloy, requiredIn, type DecodedAlloy } from "../hall/decode";
import { claimPda, hallTokenAccount, ownerTokenAccount } from "../hall/pda";
import { fetchClaim } from "../hall/program";

// The transactions a holder's own wallet signs against a register Alloy:
// Strike (create), Melt (redeem) and delivery (withdraw). Built here, not in
// the page, so a devnet proof script exercises exactly what the page sends.

/**
 * Measured on a six-leg Alloy on devnet on 6 October 2026
 * (scripts/register-strike-melt-devnet-proof.ts): Strike 81,619 compute
 * units in 1,086 bytes, Melt 26,830 in 624, delivery of six legs 141,471 in
 * 1,166. The limit is set with room above the largest, and the size is
 * checked here, because these sit close to Solana's 1,232 byte limit.
 */
const HALL_COMPUTE_UNITS = 400_000;
const TRANSACTION_BYTE_LIMIT = 1_232;

/** Delivery legs per transaction: six measured at 1,166 bytes, so no more. */
const DELIVERY_LEGS_PER_TRANSACTION = 6;

async function compile(connection: Connection, payer: PublicKey, instructions: TransactionInstruction[], what: string) {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: HALL_COMPUTE_UNITS }), ...instructions],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  const bytes = transaction.serialize().length;
  if (bytes > TRANSACTION_BYTE_LIMIT) {
    throw new Error(`The ${what} transaction is ${bytes} bytes, over Solana's ${TRANSACTION_BYTE_LIMIT}; an Alloy this wide needs a lookup table for it, which is not built yet.`);
  }
  return transaction;
}

export async function readAlloy(connection: Connection, alloy: PublicKey): Promise<DecodedAlloy> {
  const account = await connection.getAccountInfo(alloy, "confirmed");
  if (!account) throw new Error(`No Alloy account exists at ${alloy.toBase58()}.`);
  return decodeAlloy(account.data);
}

function liveLegs(alloy: DecodedAlloy) {
  return alloy.legs.slice(0, alloy.constituentCount);
}

/** Strike: deposit each leg's required amount, receive `shares` share atoms. */
export async function buildStrike(connection: Connection, program: Program<Idl>, alloyAddress: PublicKey, caller: PublicKey, shares: bigint) {
  const alloy = await readAlloy(connection, alloyAddress);
  const callerShares = ownerTokenAccount(caller, alloy.shareMint);
  const maximums = liveLegs(alloy).map((leg) => new BN(requiredIn(leg.ledger, shares, alloy.supply).toString()));
  const create = await program.methods
    .create(new BN(shares.toString()), maximums)
    .accounts({ caller, alloy: alloyAddress, shareMint: alloy.shareMint, callerShares, shareTokenProgram: TOKEN_2022_PROGRAM_ID })
    .remainingAccounts(
      liveLegs(alloy).flatMap((leg) => [
        { pubkey: leg.mint, isWritable: false, isSigner: false },
        { pubkey: ownerTokenAccount(caller, leg.mint), isWritable: true, isSigner: false },
        { pubkey: leg.hallAccount, isWritable: true, isSigner: false },
        { pubkey: leg.tokenProgram, isWritable: false, isSigner: false },
      ]),
    )
    .instruction();
  // create does not open the caller's share account, so it is opened first
  // when absent; the idempotent form is a no-op when it exists.
  const openShares = createAssociatedTokenAccountIdempotentInstruction(caller, callerShares, caller, alloy.shareMint, TOKEN_2022_PROGRAM_ID);
  return compile(connection, caller, [openShares, create], "Strike");
}

/** Melt: burn `shares`, credit the caller's Claim with every leg's share. Touches no constituent mint. */
export async function buildMelt(connection: Connection, program: Program<Idl>, hall: PublicKey, alloyAddress: PublicKey, caller: PublicKey, shares: bigint) {
  const alloy = await readAlloy(connection, alloyAddress);
  const redeem = await program.methods
    .redeem(new BN(shares.toString()))
    .accounts({
      caller,
      alloy: alloyAddress,
      shareMint: alloy.shareMint,
      callerShares: ownerTokenAccount(caller, alloy.shareMint),
      claim: claimPda(hall, alloyAddress, caller),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(liveLegs(alloy).map((leg) => ({ pubkey: leg.hallAccount, isWritable: false, isSigner: false })))
    .instruction();
  return compile(connection, caller, [redeem], "Melt");
}

export type ClaimLeg = { index: number; mint: string; units: bigint };

/** What the caller's Claim holds on each leg, or an empty list when there is no Claim. */
export async function readClaim(connection: Connection, program: Program<Idl>, hall: PublicKey, alloyAddress: PublicKey, owner: PublicKey): Promise<ClaimLeg[]> {
  const alloy = await readAlloy(connection, alloyAddress);
  const claim = await fetchClaim(program, claimPda(hall, alloyAddress, owner));
  if (!claim) return [];
  return liveLegs(alloy)
    .map((leg, index) => ({ index, mint: leg.mint.toBase58(), units: BigInt(claim.entries[index].units.toString()) }))
    .filter((leg) => leg.units > 0n);
}

/**
 * Delivery: one withdraw per claimed leg the caller asks for, up to six to a
 * transaction, so a six-leg Alloy delivers in one signature. Only legs not
 * held back belong here: a frozen leg's withdraw fails, and in a shared
 * transaction it would revert every other leg with it, which is the exact
 * failure the Claim exists to prevent.
 */
export async function buildDelivery(connection: Connection, program: Program<Idl>, hall: PublicKey, alloyAddress: PublicKey, owner: PublicKey, legs: ClaimLeg[]) {
  const alloy = await readAlloy(connection, alloyAddress);
  const claim = claimPda(hall, alloyAddress, owner);
  const transactions: VersionedTransaction[] = [];
  for (let start = 0; start < legs.length; start += DELIVERY_LEGS_PER_TRANSACTION) {
    const instructions: TransactionInstruction[] = [];
    for (const leg of legs.slice(start, start + DELIVERY_LEGS_PER_TRANSACTION)) {
      const record = liveLegs(alloy)[leg.index];
      const destination = ownerTokenAccount(owner, record.mint);
      instructions.push(createAssociatedTokenAccountIdempotentInstruction(owner, destination, owner, record.mint, record.tokenProgram));
      instructions.push(
        await program.methods
          .withdraw(leg.index, new BN(leg.units.toString()))
          .accounts({ owner, alloy: alloyAddress, claim, mint: record.mint, hallAccount: hallTokenAccount(alloyAddress, record.mint), destination, tokenProgram: record.tokenProgram })
          .instruction(),
      );
    }
    transactions.push(await compile(connection, owner, instructions, "delivery"));
  }
  return transactions;
}
