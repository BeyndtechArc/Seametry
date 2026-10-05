import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createInitializePausableConfigInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  getMintLen,
} from "@solana/spl-token";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { hallProgram } from "./program";
import { KeypairWallet } from "./keypair-wallet";
import { alloyPda, hallTokenAccount, lockedSharesPda, ownerTokenAccount, shareMintPda } from "./pda";
import {
  DEMO_HALL_PROGRAM_ID,
  GENESIS_DEPOSIT_A,
  GENESIS_DEPOSIT_B,
  GENESIS_SHARES,
  HOLDER_FUNDS,
  STOCK_DECIMALS,
} from "./constants";
import { CLAIM_ACCOUNT_SPACE, holderTopUp } from "./limits";

// No "server-only" guard: this file reads no secret of its own (it receives
// already-loaded Keypairs as parameters) and is only ever imported by route
// handlers, which Next's App Router never bundles into client JS regardless.
// The guard belongs on env.ts and issuer.ts, which do read process.env for
// real secrets, and it stays there.

/**
 * chain/tools/devnet-demo's Powers::xstocks(): the extension set HALL.md
 * section 3 cites from the real xStocks mints, minus DefaultAccountState and
 * TransferFeeConfig, which neither step of this demo's flow exercises.
 */
const MOCK_STOCK_EXTENSIONS = [
  ExtensionType.PermanentDelegate,
  ExtensionType.PausableConfig,
  ExtensionType.TransferHook,
];

async function send(connection: Connection, ixs: import("@solana/web3.js").TransactionInstruction[], feePayer: PublicKey, signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = feePayer;
  return sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
}

/** Creates one mock stock mint. Mirrors create_stock in chain/tools/devnet-demo/src/main.rs. */
async function createMockStock(connection: Connection, funder: Keypair, authority: PublicKey) {
  const mint = Keypair.generate();
  const space = getMintLen(MOCK_STOCK_EXTENSIONS);
  const rent = await connection.getMinimumBalanceForRentExemption(space);

  const signature = await send(
    connection,
    [
      SystemProgram.createAccount({
        fromPubkey: funder.publicKey,
        newAccountPubkey: mint.publicKey,
        lamports: rent,
        space,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializePermanentDelegateInstruction(mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
      createInitializePausableConfigInstruction(mint.publicKey, authority, TOKEN_2022_PROGRAM_ID),
      // PublicKey.default (all-zero) is Token-2022's own encoding of "no hook
      // program": the extension is initialized and switched off, matching
      // main.rs's transfer_hook::initialize(..., Some(authority), None) and
      // HALL.md section 3, "Transfer Hooks initialized but disabled."
      createInitializeTransferHookInstruction(mint.publicKey, authority, PublicKey.default, TOKEN_2022_PROGRAM_ID),
      createInitializeMint2Instruction(mint.publicKey, STOCK_DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),
    ],
    funder.publicKey,
    [funder, mint]
  );
  return { mint: mint.publicKey, signature };
}

export interface FoundedAlloy {
  allocId: string;
  alloy: string;
  shareMint: string;
  stocks: { mint: string; label: string; holderAccount: string }[];
  signatures: { createStockA: string; createStockB: string; fundSponsor: string; initializeAlloy: string; openHolderAtas: string; fundHolder: string };
}

/**
 * Founds a fresh alloy for one demo session and funds the connected wallet
 * with enough of each mock stock to strike shares. Mirrors found() and
 * new_striker() in chain/tools/devnet-demo/src/main.rs, with the connected
 * wallet's real pubkey standing in for devnet-demo's own ephemeral striker
 * Keypair.
 *
 * A fresh alloy per call, not one shared alloy: devnet-demo's own comment on
 * new_striker explains why sharing one caused a spurious refusal in an
 * earlier version of that tool, and the same reasoning applies here doubled,
 * since two presenters could otherwise freeze or thaw each other's demo.
 */
export async function foundAlloyFor(
  connection: Connection,
  funder: Keypair,
  issuer: Keypair,
  allocId: bigint,
  holder: PublicKey
): Promise<FoundedAlloy> {
  const { mint: stockA, signature: createStockASig } = await createMockStock(connection, funder, issuer.publicKey);
  const { mint: stockB, signature: createStockBSig } = await createMockStock(connection, funder, issuer.publicKey);

  const sponsorA = ownerTokenAccount(funder.publicKey, stockA);
  const sponsorB = ownerTokenAccount(funder.publicKey, stockB);
  const fundSponsorSig = await send(
    connection,
    [
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, sponsorA, funder.publicKey, stockA, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, sponsorB, funder.publicKey, stockB, TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(stockA, sponsorA, issuer.publicKey, GENESIS_DEPOSIT_A, [], TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(stockB, sponsorB, issuer.publicKey, GENESIS_DEPOSIT_B, [], TOKEN_2022_PROGRAM_ID),
    ],
    funder.publicKey,
    [funder, issuer]
  );

  const alloy = alloyPda(DEMO_HALL_PROGRAM_ID, funder.publicKey, allocId);
  const shareMint = shareMintPda(DEMO_HALL_PROGRAM_ID, alloy);
  const locked = lockedSharesPda(DEMO_HALL_PROGRAM_ID, alloy);
  const hallA = hallTokenAccount(alloy, stockA);
  const hallB = hallTokenAccount(alloy, stockB);

  const provider = new AnchorProvider(connection, new KeypairWallet(funder), { commitment: "confirmed" });
  const program = hallProgram(provider, DEMO_HALL_PROGRAM_ID);
  const sponsorMark = new Array(32).fill(0);
  const initSig = await program.methods
    .initializeAlloy({
      id: new BN(allocId.toString()),
      sponsorMark,
      name: "Hall Demo Alloy",
      symbol: "DEMO",
      uri: "",
      genesisShares: new BN(GENESIS_SHARES.toString()),
      deposits: [new BN(GENESIS_DEPOSIT_A.toString()), new BN(GENESIS_DEPOSIT_B.toString())],
    })
    .accounts({
      // camelCase, not the IDL's own snake_case field names: proven against
      // real devnet that Anchor's TS runtime resolver camelCases the IDL's
      // account names for its own validation regardless of how the IDL JSON
      // spells them (chain/target's `anchor idl build` writes snake_case,
      // matching the Rust struct fields verbatim; there are no generated
      // camelCase TS types to lean on here, since chain/target/ is
      // gitignored and only the IDL itself is committed). The first version
      // of this call used snake_case and failed with "Account
      // `callerShares` not provided" from a different call site, which is
      // what caught this.
      sponsor: funder.publicKey,
      alloy,
      shareMint,
      lockedShares: locked,
      shareTokenProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts([
      { pubkey: stockA, isWritable: false, isSigner: false },
      { pubkey: sponsorA, isWritable: true, isSigner: false },
      { pubkey: hallA, isWritable: true, isSigner: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: stockB, isWritable: false, isSigner: false },
      { pubkey: sponsorB, isWritable: true, isSigner: false },
      { pubkey: hallB, isWritable: true, isSigner: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false },
    ])
    .signers([funder])
    .rpc({ commitment: "confirmed" });

  const holderA = ownerTokenAccount(holder, stockA);
  const holderB = ownerTokenAccount(holder, stockB);
  const holderShares = ownerTokenAccount(holder, shareMint);
  // A visitor arriving from a link has no devnet SOL, and redeem makes the
  // caller pay the Claim account's rent, so without this the flow stops at the
  // melt, which is the one step the demonstration exists to show.
  const [holderBalance, claimRent] = await Promise.all([
    connection.getBalance(holder, "confirmed"),
    connection.getMinimumBalanceForRentExemption(CLAIM_ACCOUNT_SPACE),
  ]);
  const topUp = holderTopUp(BigInt(holderBalance), BigInt(claimRent));
  // create has no init/init_if_needed on caller_shares (chain/programs/hall/src/instructions/create.rs):
  // the account must already exist. Missed on the first pass and caught by
  // the real devnet run in scripts/hall-demo-devnet-proof.ts, which failed
  // with AccountNotInitialized on caller_shares; devnet-demo's own
  // new_striker() opens this same account for the same reason.
  const openHolderSig = await send(
    connection,
    [
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, holderA, holder, stockA, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, holderB, holder, stockB, TOKEN_2022_PROGRAM_ID),
      createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, holderShares, holder, shareMint, TOKEN_2022_PROGRAM_ID),
      ...(topUp > 0n ? [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: holder, lamports: topUp })] : []),
    ],
    funder.publicKey,
    [funder]
  );
  const fundHolderSig = await send(
    connection,
    [
      createMintToInstruction(stockA, holderA, issuer.publicKey, HOLDER_FUNDS, [], TOKEN_2022_PROGRAM_ID),
      createMintToInstruction(stockB, holderB, issuer.publicKey, HOLDER_FUNDS, [], TOKEN_2022_PROGRAM_ID),
    ],
    funder.publicKey,
    [funder, issuer]
  );

  return {
    allocId: allocId.toString(),
    alloy: alloy.toBase58(),
    shareMint: shareMint.toBase58(),
    stocks: [
      { mint: stockA.toBase58(), label: "A", holderAccount: holderA.toBase58() },
      { mint: stockB.toBase58(), label: "B", holderAccount: holderB.toBase58() },
    ],
    signatures: {
      createStockA: createStockASig,
      createStockB: createStockBSig,
      fundSponsor: fundSponsorSig,
      initializeAlloy: initSig,
      openHolderAtas: openHolderSig,
      fundHolder: fundHolderSig,
    },
  };
}
