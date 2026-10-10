import "server-only";

import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { ExtensionType, getAccountLen, getAccountTypeOfMintType, getAssociatedTokenAddressSync, getExtensionTypes, getMint, type Mint } from "@solana/spl-token";
import { formatAmount } from "../amount";
import { findAdmission, isAdmitted, type Admission } from "./admissions";
import { messageDigest, openApproval, signApproval } from "./approval";
import type { AllocationConfig } from "./config";
import { MIN_LEG_USDC_ATOMS, QUOTE_TTL_MS, USDC_MINT, USDC_TOKEN_PROGRAM, lotCapAtoms, quoteParams, routingFeeBps, unlistedProgram } from "./rules";
import { jupiter, type JupiterQuote } from "../jupiter";
import { Refusal } from "../refusal";

function admittedLot(mint: string): Admission {
  const admission = findAdmission(mint);
  if (!admission) throw new Refusal(404, `${mint} is not in the admissions snapshot, so it cannot enter an Allocation.`);
  if (!isAdmitted(admission)) {
    throw new Refusal(403, `${admission.instrument.symbol ?? mint} was refused by the policy engine and cannot enter an Allocation.`);
  }
  return admission;
}

// Token account layout, shared by Token and Token-2022: mint (32), owner (32), amount (u64 little endian).
function tokenAmount(data: Buffer | Uint8Array | null | undefined): bigint {
  if (!data || data.length < 72) return 0n;
  return Buffer.from(data).readBigUInt64LE(64);
}

/**
 * The size the associated token program gives a new holder's account for
 * this mint. spl-token's getAccountLenForMint counts a ConfidentialTransfer
 * account extension the program never adds unasked, which made AMD's 478
 * bytes against the 179 that real holder accounts measured on mainnet on
 * 7 October 2026, and would refuse wallets that can pay.
 */
function newHolderAccountLen(mint: Mint): number {
  const accountTypes = getExtensionTypes(mint.tlvData)
    .map(getAccountTypeOfMintType)
    .filter((type) => type !== ExtensionType.Uninitialized && type !== ExtensionType.ConfidentialTransferAccount);
  return getAccountLen([...new Set(accountTypes), ExtensionType.ImmutableOwner]);
}

/** The base fee for the one signature a leg carries, in lamports. */
const SIGNATURE_FEE_LAMPORTS = 5_000n;

/**
 * Refuses a leg the wallet cannot pay for, naming what it holds and what
 * the leg needs. The SOL floor is the rent to open the wallet's account for
 * this lot when it has none yet, sized from the mint's own extensions, plus
 * the signature and priority fees; the rent comes back if that account is
 * ever closed.
 */
async function refuseUnfunded(
  connection: Connection,
  lot: Admission,
  mint: string,
  inAtoms: bigint,
  priorityFeeLamports: bigint,
  [walletAccount, usdcAccount, lotAccount]: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>,
): Promise<void> {
  const symbol = lot.instrument.symbol ?? mint;
  const usdcHeld = tokenAmount(usdcAccount?.data);
  if (usdcHeld < inAtoms) {
    throw new Refusal(402, `This wallet holds ${formatAmount(usdcHeld, 6)} USDC; buying ${symbol} spends ${formatAmount(inAtoms, 6)} USDC.`);
  }
  let rent = 0n;
  if (!lotAccount) {
    const mintAccount = await getMint(connection, new PublicKey(mint), "confirmed", new PublicKey(lot.token_program));
    rent = BigInt(await connection.getMinimumBalanceForRentExemption(newHolderAccountLen(mintAccount)));
  }
  const needed = rent + SIGNATURE_FEE_LAMPORTS + priorityFeeLamports;
  const held = BigInt(walletAccount?.lamports ?? 0);
  if (held < needed) {
    const opening = rent > 0n ? `${formatAmount(rent, 9)} SOL to open its ${symbol} account, returned if that account is closed, and ` : "";
    throw new Refusal(402, `This wallet holds ${formatAmount(held, 9)} SOL; buying ${symbol} needs ${opening}${formatAmount(needed - rent, 9)} SOL in network fees. Add SOL to the wallet and buy again.`);
  }
}

export type BalanceChange = { atoms: string; scale: number; unit: string };

export type PreparedLeg = {
  mint: string;
  symbol: string;
  inAtoms: string;
  outAtoms: string;
  floorAtoms: string;
  outScale: number;
  route: string[];
  contextSlot: number;
  receivedAt: string;
  expiresAt: string;
  priorityFeeLamports: string;
  /** The tier this leg was quoted at, from the plan's size. */
  routingFeeBps: number;
  /** USDC atoms the simulation moved into Seametry's fee account. */
  routingFeeAtoms: string;
  simulated: BalanceChange[];
  transaction: string;
  approval: string;
};

/**
 * Quotes, builds, checks and simulates one leg, and signs an approval over
 * exactly what was simulated. Every refusal names its reason. Nothing here
 * signs for the holder: the transaction goes back unsigned.
 *
 * `planMints` is every lot the plan buys, which sets the fee's tier. A buyer
 * could name a wider plan than they go on to sign; each leg is its own swap,
 * so nothing ties them, and the cost is bounded at the gap between tiers on
 * the legs actually bought. Every named lot must be admitted, so the plan
 * cannot be padded with anything this deployment would not sell.
 */
export async function prepareLeg(config: AllocationConfig, walletText: string, mint: string, inAtoms: bigint, planMints: string[]): Promise<PreparedLeg> {
  const lot = admittedLot(mint);
  const plan = new Set(planMints);
  if (plan.size !== planMints.length) throw new Refusal(400, "The plan names a constituent more than once.");
  if (!plan.has(mint)) throw new Refusal(400, `The plan does not include ${lot.instrument.symbol ?? mint}, the constituent this leg buys.`);
  planMints.forEach(admittedLot);
  const feeBps = routingFeeBps(plan.size);
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletText);
  } catch {
    throw new Refusal(400, `"${walletText}" is not a Solana address.`);
  }
  const cap = lotCapAtoms(lot.capacity_usdc);
  if (inAtoms < MIN_LEG_USDC_ATOMS) throw new Refusal(400, "Each constituent needs at least 1 USDC. A live route may require more.");
  if (inAtoms > cap) {
    throw new Refusal(400, `${lot.instrument.symbol ?? mint} may spend at most ${lot.capacity_usdc} USDC under the captured capacity decision.`);
  }

  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  // The fee is paid into the fee wallet's USDC account; Jupiter will not open
  // it, so a missing one is refused here, before any quote, as Seametry's to fix.
  const feeAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(config.feeWallet), true, new PublicKey(USDC_TOKEN_PROGRAM));
  if (!(await connection.getAccountInfo(feeAccount, "confirmed"))) {
    throw new Refusal(503, `Seametry's routing fee account ${feeAccount.toBase58()} is not open on mainnet, so no leg can be prepared; Seametry has to open it.`);
  }

  const query = quoteParams(mint, inAtoms, feeBps);
  const quote = await jupiter<JupiterQuote>(config.jupiterApiKey, `/quote?${query}`);
  const receivedAt = new Date();
  const expiresAt = new Date(receivedAt.getTime() + QUOTE_TTL_MS);

  const swap = await jupiter<{ swapTransaction: string; prioritizationFeeLamports?: number }>(config.jupiterApiKey, "/swap", {
    method: "POST",
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.toBase58(), dynamicComputeUnitLimit: true, feeAccount: feeAccount.toBase58() }),
  });
  const transaction = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));

  const unlisted = unlistedProgram(transaction);
  if (unlisted) {
    throw new Refusal(502, `The swap Jupiter built invokes ${unlisted}, which is not on this deployment's program allowlist, so it was not offered for signing.`);
  }
  const feePayer = transaction.message.staticAccountKeys[0];
  if (!feePayer?.equals(wallet)) {
    throw new Refusal(502, "The swap Jupiter built is not paid for by the connected wallet, so it was not offered for signing.");
  }

  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), wallet, false, new PublicKey(USDC_TOKEN_PROGRAM));
  const lotAccount = getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, new PublicKey(lot.token_program));
  // The fee account is watched too: the fee shown is what simulation moves
  // into it, not a figure computed beside the transaction.
  const watched = [wallet, usdcAccount, lotAccount, feeAccount];

  const before = await connection.getMultipleAccountsInfo(watched, "confirmed");
  // Checked before simulating because simulation reports a short wallet as
  // the System program's error 0x1 inside the account opening instruction,
  // which names neither the shortfall nor what to do about it.
  await refuseUnfunded(connection, lot, mint, inAtoms, BigInt(swap.prioritizationFeeLamports ?? 0), before);
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: watched.map((key) => key.toBase58()) },
  });
  if (simulation.value.err) {
    const logs = (simulation.value.logs ?? []).filter((line) => /error|failed/i.test(line)).slice(-3).join(" | ");
    throw new Refusal(422, `Simulation on mainnet refused this leg: ${JSON.stringify(simulation.value.err)}${logs ? `. ${logs}` : ""}`);
  }
  const after = simulation.value.accounts ?? [];
  const accountData = (index: number) => {
    const data = after[index]?.data;
    return Array.isArray(data) ? Buffer.from(data[0], "base64") : null;
  };
  const lamportsBefore = BigInt(before[0]?.lamports ?? 0);
  const lamportsAfter = BigInt(after[0]?.lamports ?? 0);
  const simulated: BalanceChange[] = [
    { atoms: (tokenAmount(accountData(1)) - tokenAmount(before[1]?.data)).toString(), scale: 6, unit: "USDC" },
    { atoms: (tokenAmount(accountData(2)) - tokenAmount(before[2]?.data)).toString(), scale: lot.decimals, unit: lot.instrument.symbol ?? mint },
    { atoms: (lamportsAfter - lamportsBefore).toString(), scale: 9, unit: "SOL" },
  ];
  const feeAtoms = tokenAmount(accountData(3)) - tokenAmount(before[3]?.data);

  const now = new Date();
  if (now > expiresAt) throw new Refusal(410, "This quote expired. Refresh to see current terms.");

  const approval = signApproval(
    {
      wallet: wallet.toBase58(),
      mint,
      inputDigest: lot.capacity_decision.input_digest,
      policyVersion: lot.capacity_decision.policy_version,
      inAtoms: quote.inAmount,
      outAtoms: quote.outAmount,
      floorAtoms: quote.otherAmountThreshold,
      messageSha256: messageDigest(transaction.message.serialize()),
      expiresAt: expiresAt.toISOString(),
    },
    config.approvalSecret,
  );

  return {
    mint,
    symbol: lot.instrument.symbol ?? mint,
    inAtoms: quote.inAmount,
    outAtoms: quote.outAmount,
    floorAtoms: quote.otherAmountThreshold,
    outScale: lot.decimals,
    route: quote.routePlan.map((hop) => hop.swapInfo.label),
    contextSlot: quote.contextSlot,
    receivedAt: receivedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    priorityFeeLamports: String(swap.prioritizationFeeLamports ?? 0),
    routingFeeBps: feeBps,
    routingFeeAtoms: feeAtoms.toString(),
    simulated,
    transaction: swap.swapTransaction,
    approval,
  };
}

/**
 * Broadcasts a leg the holder signed, only if it is the transaction this
 * server approved, unchanged, still inside its quote's lifetime, and still
 * judged on the same evidence. Returns the signature.
 */
export async function submitLeg(config: AllocationConfig, signedBase64: string, approvalToken: string): Promise<string> {
  const opened = openApproval(approvalToken, config.approvalSecret, new Date());
  if ("refused" in opened) throw new Refusal(410, opened.refused);
  const { terms } = opened;

  let transaction: VersionedTransaction;
  try {
    transaction = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
  } catch {
    throw new Refusal(400, "The signed transaction could not be read.");
  }
  if (messageDigest(transaction.message.serialize()) !== terms.messageSha256) {
    throw new Refusal(409, "The transaction was changed after it was approved, so it was not sent. Prepare the leg again.");
  }
  const lot = admittedLot(terms.mint);
  if (lot.capacity_decision.input_digest !== terms.inputDigest || lot.capacity_decision.policy_version !== terms.policyVersion) {
    throw new Refusal(409, "The admission this leg was approved under has changed since. Prepare the leg again.");
  }
  const signature = transaction.signatures[0];
  if (!signature || signature.every((byte) => byte === 0)) {
    throw new Refusal(400, "The transaction carries no signature from the connected wallet.");
  }

  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  try {
    return await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
  } catch (error) {
    throw new Refusal(422, `Mainnet refused the transaction: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export type LegStatus = { state: "pending" | "confirmed" | "finalized" | "failed"; detail?: string };

export async function legStatus(config: AllocationConfig, signature: string): Promise<LegStatus> {
  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  const { value } = await connection.getSignatureStatuses([signature]);
  const status = value[0];
  if (!status) return { state: "pending" };
  if (status.err) return { state: "failed", detail: JSON.stringify(status.err) };
  if (status.confirmationStatus === "finalized") return { state: "finalized" };
  if (status.confirmationStatus === "confirmed") return { state: "confirmed" };
  return { state: "pending" };
}
