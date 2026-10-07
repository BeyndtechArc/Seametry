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

/**
 * What the funder spends per stand-in, its token account and their share of
 * the lookup table, with fees: 5,501,320 lamports per leg on a six-leg devnet
 * founding on 6 October 2026, beyond the top-up. Held at 0.01 SOL so a
 * founding is refused before it runs out partway rather than after.
 */
const FUNDER_PER_LEG_LAMPORTS = 10_000_000n;

function formatSol(lamports: bigint) {
  return `${lamports / 1_000_000_000n}.${(lamports % 1_000_000_000n).toString().padStart(9, "0")}`;
}

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

const LOOKUP_TABLE_ATTEMPTS = 4;
const LOOKUP_TABLE_PAUSE_MS = 1_500;

/**
 * The table's address derives from a slot the program must find among the
 * last 512 in the executing node's SlotHashes. Production foundings were
 * refused twice ("507876824 is not a recent slot", "507896021 is not a
 * recent slot"), the second time on all three attempts of a retry that read
 * getSlot("finalized") afresh each time, while the same code passed from a
 * developer machine. A fresh read failing every time from one region fits a
 * node behind public devnet's load balancer answering getSlot from minutes in
 * the past; it is not observed directly, since samples from outside Vercel
 * showed no stale node.
 *
 * So no node is asked what time it is. The slot is the one our own stand-in
 * transaction landed in seconds earlier: a real block, recent by
 * construction, and one a stale node cannot report at all, since it has not
 * seen that transaction. A node that has not seen it yet answers null, which
 * is waited out; so is a refusal from an executing node a moment behind.
 */
async function createLookupTable(connection: Connection, funder: Keypair, addresses: PublicKey[], landed: string) {
  let refusal: unknown;
  for (let attempt = 1; attempt <= LOOKUP_TABLE_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, LOOKUP_TABLE_PAUSE_MS));
    const status = (await connection.getSignatureStatus(landed)).value;
    if (!status) {
      refusal = new Error(`The devnet node answering did not yet know transaction ${landed}, whose slot names the lookup table.`);
      continue;
    }
    const [create, lookupTable] = AddressLookupTableProgram.createLookupTable({ authority: funder.publicKey, payer: funder.publicKey, recentSlot: status.slot });
    const extend = AddressLookupTableProgram.extendLookupTable({ lookupTable, authority: funder.publicKey, payer: funder.publicKey, addresses });
    try {
      return { lookupTable, signature: await send(connection, [create, extend], funder, []) };
    } catch (error) {
      if (!String(error).includes("is not a recent slot")) throw error;
      refusal = error;
    }
  }
  throw new Refusal(
    503,
    `Devnet would not accept the lookup table after ${LOOKUP_TABLE_ATTEMPTS} attempts, so nothing was founded and your wallet was not asked to sign. Try again in a minute. Last refusal: ${refusal instanceof Error ? refusal.message : String(refusal)}`,
  );
}

/** How many of a sponsor's Alloy numbers are read per call while looking for a free one. */
const ID_BATCH = 10;

/**
 * The sponsor's lowest Alloy number with no account on this Hall. An Alloy's
 * address is [ALLOY_SEED, sponsor, id], so every founding needs its own id;
 * the route asked for 1 every time until 8 October 2026, which refused a
 * sponsor's second Alloy as already founded. Two foundings by one sponsor at
 * the same moment can pick the same number; the later one then fails on
 * chain, because initialize_alloy will not create an account that exists.
 */
export async function nextAlloyId(connection: Connection, hall: PublicKey, sponsor: PublicKey): Promise<bigint> {
  for (let first = 1n; ; first += BigInt(ID_BATCH)) {
    const ids = Array.from({ length: ID_BATCH }, (_, i) => first + BigInt(i));
    const accounts = await connection.getMultipleAccountsInfo(ids.map((id) => alloyPda(hall, sponsor, id)), "confirmed");
    const free = accounts.findIndex((account) => account === null);
    if (free >= 0) return ids[free];
  }
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
  legs: FoundingLeg[],
): Promise<PreparedFounding> {
  const id = await nextAlloyId(connection, hall, sponsor);
  const alloy = alloyPda(hall, sponsor, id);
  const shareMint = shareMintPda(hall, alloy);
  const lockedShares = lockedSharesPda(hall, alloy);
  const signatures: Record<string, string> = {};

  // An empty funder fails halfway and leaves stand-ins behind, so it is
  // refused before anything is spent, and said to be ours to fix.
  const funds = BigInt(await connection.getBalance(funder.publicKey, "confirmed"));
  const needed = FOUNDING_ALLOWANCE_LAMPORTS + BigInt(legs.length + 1) * FUNDER_PER_LEG_LAMPORTS;
  if (funds < needed) {
    throw new Refusal(
      503,
      `Seametry's devnet funder holds ${formatSol(funds)} SOL, short of the ${formatSol(needed)} SOL a founding of ${legs.length} stocks prepares with. Nothing was spent and nothing is needed from your wallet; Seametry has to refill the funder.`,
    );
  }

  // Two rounds instead of one transaction after another: every stand-in at
  // once, then the deposits, the top-up and the lookup table at once. The
  // table only names addresses, so it needs none of the round-two accounts
  // to exist; it takes its slot from a stand-in that has just landed. The
  // cost of sending at once: public devnet answered one 429 during the
  // six-leg proof on 6 October 2026, which web3.js retried on its own.
  const standIns = await Promise.all(legs.map((leg) => createStandIn(connection, funder, issuer, leg)));
  const prepared: PreparedFounding["legs"] = legs.map((leg, index) => {
    const mint = standIns[index].mint;
    signatures[`standIn${leg.symbol}`] = standIns[index].signature;
    return {
      symbol: leg.symbol,
      realMint: leg.realMint,
      standIn: mint.toBase58(),
      sponsorAccount: ownerTokenAccount(sponsor, mint).toBase58(),
      hallAccount: hallTokenAccount(alloy, mint).toBase58(),
      deposit: ((leg.atomsPerShare * GENESIS_SHARES) / ONE_SHARE_ATOMS).toString(),
    };
  });

  const addresses = [
    alloy,
    shareMint,
    lockedShares,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    ...prepared.flatMap((leg) => [new PublicKey(leg.standIn), new PublicKey(leg.sponsorAccount), new PublicKey(leg.hallAccount)]),
  ];
  const balance = BigInt(await connection.getBalance(sponsor, "confirmed"));
  // Three legs per transaction keeps each well inside the legacy size limit.
  const batches = Array.from({ length: Math.ceil(prepared.length / 3) }, (_, index) => prepared.slice(index * 3, index * 3 + 3));
  const [table, topUp, ...funded] = await Promise.all([
    createLookupTable(connection, funder, addresses, standIns[0].signature),
    balance < FOUNDING_ALLOWANCE_LAMPORTS
      ? send(connection, [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: sponsor, lamports: FOUNDING_ALLOWANCE_LAMPORTS - balance })], funder, [])
      : Promise.resolve(undefined),
    ...batches.map((batch) =>
      send(
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
      ),
    ),
  ]);
  const { lookupTable } = table;
  signatures.lookupTable = table.signature;
  if (topUp) signatures.topUp = topUp;
  funded.forEach((signature, index) => (signatures[`fundSponsor${index + 1}`] = signature));

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
