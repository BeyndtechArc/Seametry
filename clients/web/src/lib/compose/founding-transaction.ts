import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { BN, type Idl, type Program } from "@coral-xyz/anchor";
import type { PreparedFounding } from "./founding-prepare";

/** A visitor's Alloy has no registered mark; the sponsor's wallet is recorded separately. */
export const UNREGISTERED_SPONSOR_MARK = new Uint8Array(32);

/**
 * A six-leg founding consumed 253,393 compute units on devnet on 5 October
 * 2026 (scripts/register-founding-devnet-proof.ts, signature
 * 4G9n8fVBEVG95MV2rL4ViScbpeQioTDNfV5GMbZi1AXEwrQWF1JKtnFvEEbd2sCTM1j3dLqNYW5DWyt3pivDQYVM),
 * over the default 200,000. This leaves room for the twelve-leg maximum to
 * be measured before it is offered at that size.
 */
export const FOUNDING_COMPUTE_UNITS = 400_000;

export type FoundingIdentity = { name: string; symbol: string; uri: string };

/** The founding transaction the sponsor signs: a compute budget and initialize_alloy, compiled against the prepared lookup table. */
export async function buildFoundingTransaction(
  connection: Connection,
  program: Program<Idl>,
  prepared: PreparedFounding,
  identity: FoundingIdentity,
): Promise<VersionedTransaction> {
  const sponsor = new PublicKey(prepared.sponsor);
  const instruction = await program.methods
    .initializeAlloy({
      id: new BN(prepared.id),
      sponsorMark: Array.from(UNREGISTERED_SPONSOR_MARK),
      name: identity.name,
      symbol: identity.symbol,
      uri: identity.uri,
      genesisShares: new BN(prepared.genesisShares),
      deposits: prepared.legs.map((leg) => new BN(leg.deposit)),
    })
    .accounts({
      sponsor,
      alloy: new PublicKey(prepared.alloy),
      shareMint: new PublicKey(prepared.shareMint),
      lockedShares: new PublicKey(prepared.lockedShares),
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(
      prepared.legs.flatMap((leg) => [
        { pubkey: new PublicKey(leg.standIn), isWritable: false, isSigner: false },
        { pubkey: new PublicKey(leg.sponsorAccount), isWritable: true, isSigner: false },
        { pubkey: new PublicKey(leg.hallAccount), isWritable: true, isSigner: false },
        { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false },
      ]),
    )
    .instruction();

  const table = (await connection.getAddressLookupTable(new PublicKey(prepared.lookupTable))).value;
  if (!table) throw new Error(`The founding's lookup table ${prepared.lookupTable} is not readable yet; try again in a moment.`);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: sponsor,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: FOUNDING_COMPUTE_UNITS }), instruction],
  }).compileToV0Message([table]);
  return new VersionedTransaction(message);
}
