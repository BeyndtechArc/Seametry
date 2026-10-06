import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { decodeAlloy, requiredIn } from "../hall/decode";
import { ownerTokenAccount } from "../hall/pda";
import { Refusal } from "../refusal";

// Receives already-loaded Keypairs and reads no secret itself, like
// lib/compose/founding-prepare.ts; the route that calls it owns the keys.

/** At most this many shares per request, so one call cannot drain the funder. */
export const MAX_STRIKE_SHARE_ATOMS = 10_000_000n;

/**
 * What the striker's wallet is topped up to before it signs: rent for its
 * share token account and the Claim a later Melt creates, with fees. On a
 * six-leg devnet Alloy on 6 October 2026 the Strike cost the holder
 * 1,518,840 lamports, the Melt 2,976,800 and delivery 5,000; held at 0.02
 * SOL, about four times that.
 */
const STRIKER_ALLOWANCE_LAMPORTS = 20_000_000n;

/** Funder spend per leg: one token account's rent and a share of fees, held high. */
const FUNDER_PER_LEG_LAMPORTS = 5_000_000n;

export type PreparedStrike = {
  alloy: string;
  shares: string;
  legs: { mint: string; required: string; held: string; minted: string; account: string }[];
  signatures: string[];
};

async function send(connection: Connection, instructions: TransactionInstruction[], payer: Keypair, signers: Keypair[]) {
  return sendAndConfirmTransaction(connection, new Transaction().add(...instructions), [payer, ...signers], { commitment: "confirmed" });
}

async function held(connection: Connection, account: PublicKey) {
  try {
    return (await getAccount(connection, account, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return 0n;
    throw error;
  }
}

/**
 * Puts in the striker's wallet exactly the stand-ins a Strike of `shares`
 * takes, minting only what it lacks, and enough SOL to sign. Devnet only:
 * the stand-ins exist because the real stocks do not, and only an Alloy
 * whose every leg is a stand-in this issuer mints can be prepared this way.
 */
export async function prepareStrike(
  connection: Connection,
  funder: Keypair,
  issuer: Keypair,
  hall: PublicKey,
  alloyAddress: PublicKey,
  striker: PublicKey,
  shares: bigint,
): Promise<PreparedStrike> {
  if (shares <= 0n || shares > MAX_STRIKE_SHARE_ATOMS) {
    throw new Refusal(400, `A Strike prepares between 1 and ${MAX_STRIKE_SHARE_ATOMS} share atoms (10 shares), received ${shares}.`);
  }
  const account = await connection.getAccountInfo(alloyAddress, "confirmed");
  if (!account) throw new Refusal(404, `No Alloy account exists at ${alloyAddress.toBase58()} on devnet.`);
  if (!account.owner.equals(hall)) throw new Refusal(400, `${alloyAddress.toBase58()} is owned by ${account.owner.toBase58()}, not the register's Hall ${hall.toBase58()}.`);
  const alloy = decodeAlloy(account.data);

  const legs = await Promise.all(
    alloy.legs.slice(0, alloy.constituentCount).map(async (leg) => {
      const mint = await getMint(connection, leg.mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (!mint.mintAuthority?.equals(issuer.publicKey)) {
        throw new Refusal(409, `Leg ${leg.mint.toBase58()} is not a Seametry devnet stand-in, so it cannot be minted for a Strike; strike with stocks you already hold.`);
      }
      const required = requiredIn(leg.ledger, shares, alloy.supply);
      const destination = ownerTokenAccount(striker, leg.mint);
      const already = await held(connection, destination);
      return { mint: leg.mint, destination, required, already, shortfall: required > already ? required - already : 0n };
    }),
  );

  const funds = BigInt(await connection.getBalance(funder.publicKey, "confirmed"));
  const needed = STRIKER_ALLOWANCE_LAMPORTS + BigInt(legs.length) * FUNDER_PER_LEG_LAMPORTS;
  if (funds < needed) {
    throw new Refusal(503, `Seametry's devnet funder holds ${funds} lamports, short of the ${needed} a Strike prepares with. Nothing was spent and nothing is needed from your wallet; Seametry has to refill the funder.`);
  }

  // Three legs per transaction keeps each inside the legacy size limit, sent
  // together, as founding-prepare.ts does.
  const toMint = legs.filter((leg) => leg.shortfall > 0n);
  const batches = Array.from({ length: Math.ceil(toMint.length / 3) }, (_, index) => toMint.slice(index * 3, index * 3 + 3));
  const balance = BigInt(await connection.getBalance(striker, "confirmed"));
  const signatures = await Promise.all([
    ...batches.map((batch) =>
      send(
        connection,
        batch.flatMap((leg) => [
          createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, leg.destination, striker, leg.mint, TOKEN_2022_PROGRAM_ID),
          createMintToInstruction(leg.mint, leg.destination, issuer.publicKey, leg.shortfall, [], TOKEN_2022_PROGRAM_ID),
        ]),
        funder,
        [issuer],
      ),
    ),
    ...(balance < STRIKER_ALLOWANCE_LAMPORTS
      ? [send(connection, [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: striker, lamports: STRIKER_ALLOWANCE_LAMPORTS - balance })], funder, [])]
      : []),
  ]);

  return {
    alloy: alloyAddress.toBase58(),
    shares: shares.toString(),
    legs: legs.map((leg) => ({
      mint: leg.mint.toBase58(),
      required: leg.required.toString(),
      held: leg.already.toString(),
      minted: leg.shortfall.toString(),
      account: leg.destination.toBase58(),
    })),
    signatures,
  };
}
