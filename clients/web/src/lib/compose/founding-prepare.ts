import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMint2Instruction,
  createInitializePausableConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { ONE_SHARE_ATOMS } from "../hall/constants";
import { Refusal } from "../refusal";
import { alloyPda, hallTokenAccount, lockedSharesPda, ownerTokenAccount, shareMintPda } from "../hall/pda";

// Receives already-loaded Keypairs and reads no secret itself, like
// lib/hall/found.ts; the route that calls it owns the keys.

/**
 * The extension set of the demo's mock stocks (lib/hall/found.ts, from
 * HALL.md section 3's account of real xStocks), plus on-chain metadata so an
 * explorer names each stand-in. Like the demo, it omits DefaultAccountState
 * and TransferFeeConfig, and the Scaled UI multiplier, none of which Strike,
 * Melt or founding exercises.
 */
const STAND_IN_EXTENSIONS = [
  ExtensionType.PermanentDelegate,
  ExtensionType.PausableConfig,
  ExtensionType.TransferHook,
  ExtensionType.MetadataPointer,
];

/** Genesis is one whole share, so each deposit is that leg's atoms per share. */
export const GENESIS_SHARES = ONE_SHARE_ATOMS;

/**
 * Lamports the sponsor wallet is topped up to before it signs: the rent of
 * the accounts initialize_alloy creates and pays for (the Alloy, its share
 * mint, the locked genesis account and one Hall token account per leg),
 * plus fees. A six-leg founding cost the sponsor 24,764,920 lamports on
 * devnet on 5 October 2026 (scripts/register-founding-devnet-proof.ts);
 * this is about twice that.
 */
export const FOUNDING_ALLOWANCE_LAMPORTS = 50_000_000n;

export type FoundingLeg = { symbol: string; realMint: string; decimals: number; atomsPerShare: bigint };

export type PreparedFounding = {
  hall: string;
  sponsor: string;
  id: string;
  alloy: string;
  shareMint: string;
  lockedShares: string;
  lookupTable: string;
  genesisShares: string;
  legs: { symbol: string; realMint: string; standIn: string; sponsorAccount: string; hallAccount: string; deposit: string }[];
  signatures: Record<string, string>;
};

async function send(connection: Connection, instructions: TransactionInstruction[], payer: Keypair, signers: Keypair[]) {
  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = payer.publicKey;
  return sendAndConfirmTransaction(connection, transaction, [payer, ...signers], { commitment: "confirmed" });
}

async function createStandIn(connection: Connection, funder: Keypair, issuer: Keypair, leg: FoundingLeg) {
  const mint = Keypair.generate();
  const metadata: TokenMetadata = {
    mint: mint.publicKey,
    updateAuthority: issuer.publicKey,
    name: `${leg.symbol} devnet stand-in`,
    symbol: leg.symbol,
    uri: "",
    additionalMetadata: [],
  };
  const space = getMintLen(STAND_IN_EXTENSIONS);
  // Token-2022 grows the account itself when the metadata is written, so the
  // rent for the metadata is paid up front while the space covers the mint.
  const lamports = await connection.getMinimumBalanceForRentExemption(space + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
  const signature = await send(
    connection,
    [
      SystemProgram.createAccount({ fromPubkey: funder.publicKey, newAccountPubkey: mint.publicKey, lamports, space, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializePermanentDelegateInstruction(mint.publicKey, issuer.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializePausableConfigInstruction(mint.publicKey, issuer.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeTransferHookInstruction(mint.publicKey, issuer.publicKey, PublicKey.default, TOKEN_2022_PROGRAM_ID),
      createInitializeMetadataPointerInstruction(mint.publicKey, issuer.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMint2Instruction(mint.publicKey, leg.decimals, issuer.publicKey, issuer.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID,
        metadata: mint.publicKey,
        updateAuthority: issuer.publicKey,
        mint: mint.publicKey,
        mintAuthority: issuer.publicKey,
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadata.uri,
      }),
    ],
    funder,
    [mint, issuer],
  );
  return { mint: mint.publicKey, signature };
}

/**
 * Everything a founding needs before the sponsor signs, paid by the funder:
 * a stand-in mint per leg, the sponsor's token accounts holding exactly the
 * genesis deposits, enough SOL for the sponsor to pay initialize_alloy's
 * rent, and an address lookup table naming every account the founding
 * touches. The lookup table is not optional: six legs put initialize_alloy
 * with a compute budget over the 1,232 byte legacy transaction limit.
 */
export async function prepareFounding(
  connection: Connection,
  funder: Keypair,
  issuer: Keypair,
  hall: PublicKey,
  sponsor: PublicKey,
  id: bigint,
  legs: FoundingLeg[],
): Promise<PreparedFounding> {
  const alloy = alloyPda(hall, sponsor, id);
  if (await connection.getAccountInfo(alloy, "confirmed")) {
    throw new Refusal(409, `This sponsor already founded Alloy ${id} on this Hall, at ${alloy.toBase58()}.`);
  }
  const shareMint = shareMintPda(hall, alloy);
  const lockedShares = lockedSharesPda(hall, alloy);
  const signatures: Record<string, string> = {};

  const prepared: PreparedFounding["legs"] = [];
  for (const leg of legs) {
    const { mint, signature } = await createStandIn(connection, funder, issuer, leg);
    signatures[`standIn${leg.symbol}`] = signature;
    prepared.push({
      symbol: leg.symbol,
      realMint: leg.realMint,
      standIn: mint.toBase58(),
      sponsorAccount: ownerTokenAccount(sponsor, mint).toBase58(),
      hallAccount: hallTokenAccount(alloy, mint).toBase58(),
      deposit: ((leg.atomsPerShare * GENESIS_SHARES) / ONE_SHARE_ATOMS).toString(),
    });
  }

  // Three legs per transaction keeps each well inside the legacy size limit.
  for (let start = 0; start < prepared.length; start += 3) {
    const batch = prepared.slice(start, start + 3);
    signatures[`fundSponsor${start / 3 + 1}`] = await send(
      connection,
      batch.flatMap((leg) => {
        const mint = new PublicKey(leg.standIn);
        const account = new PublicKey(leg.sponsorAccount);
        return [
          createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, account, sponsor, mint, TOKEN_2022_PROGRAM_ID),
          createMintToInstruction(mint, account, issuer.publicKey, BigInt(leg.deposit), [], TOKEN_2022_PROGRAM_ID),
        ];
      }),
      funder,
      [issuer],
    );
  }

  const balance = BigInt(await connection.getBalance(sponsor, "confirmed"));
  if (balance < FOUNDING_ALLOWANCE_LAMPORTS) {
    signatures.topUp = await send(
      connection,
      [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: sponsor, lamports: FOUNDING_ALLOWANCE_LAMPORTS - balance })],
      funder,
      [],
    );
  }

  const slot = await connection.getSlot("finalized");
  const [createTable, lookupTable] = AddressLookupTableProgram.createLookupTable({ authority: funder.publicKey, payer: funder.publicKey, recentSlot: slot });
  const addresses = [
    alloy,
    shareMint,
    lockedShares,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    ...prepared.flatMap((leg) => [new PublicKey(leg.standIn), new PublicKey(leg.sponsorAccount), new PublicKey(leg.hallAccount)]),
  ];
  signatures.lookupTable = await send(
    connection,
    [createTable, AddressLookupTableProgram.extendLookupTable({ lookupTable, authority: funder.publicKey, payer: funder.publicKey, addresses })],
    funder,
    [],
  );

  return {
    hall: hall.toBase58(),
    sponsor: sponsor.toBase58(),
    id: id.toString(),
    alloy: alloy.toBase58(),
    shareMint: shareMint.toBase58(),
    lockedShares: lockedShares.toBase58(),
    lookupTable: lookupTable.toBase58(),
    genesisShares: GENESIS_SHARES.toString(),
    legs: prepared,
    signatures,
  };
}
