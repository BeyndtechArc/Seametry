import "server-only";

import { Connection, PublicKey, SendTransactionError, VersionedTransaction } from "@solana/web3.js";
import { ExtensionType, getAccountLen, getAccountTypeOfMintType, getAssociatedTokenAddressSync, getExtensionTypes, getMint, type Mint } from "@solana/spl-token";
import { formatAmount } from "../amount";
import { findAdmission, isAdmitted, type Admission } from "./admissions";
import { messageDigest, openApproval, signApproval } from "./approval";
import type { AllocationConfig } from "./config";
import { MIN_LEG_USDC_ATOMS, PRIORITY_FEE, SENDER_MAX_ACCOUNTS, SENDER_TIP_ACCOUNTS, SENDER_TIP_LAMPORTS, SLIPPAGE_BPS, failedVenueProgram, preflightRefusal, SIGNING_WINDOW_MS, TIP_VALUE_TTL_MS, loadedDataLimit, USDC_MINT, USDC_SCALE, USDC_TOKEN_PROGRAM, lotCapAtoms, quoteParams, routingFeeBps, sellQuoteParams, tipOffsetBps, unlistedProgram } from "./rules";
import { jupiter, type JupiterQuote } from "../jupiter";
import { Refusal } from "../refusal";
import { broadcastSender, carriesSenderTip, composeSwap, loadedDataLimitOf, senderTipAccount, signatureFeeLamports, withLoadedDataLimit, type JupiterInstructions } from "./sender";
import { randomInt } from "node:crypto";

function admittedLot(mint: string): Admission {
  const admission = findAdmission(mint);
  if (!admission) throw new Refusal(404, `${mint} is not in the admissions snapshot, so it cannot enter an Allocation.`);
  if (!isAdmitted(admission)) {
    throw new Refusal(403, `${admission.instrument.symbol ?? mint} was refused by the policy engine and cannot enter an Allocation.`);
  }
  return admission;
}

function listedLot(mint: string): Admission {
  const admission = findAdmission(mint);
  if (!admission) throw new Refusal(404, `${mint} is not in this deployment's instrument register, so it cannot be quoted here.`);
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

/**
 * Refuses a leg the wallet cannot pay for, naming what it holds and what
 * the leg needs. The SOL floor is the rent to open the wallet's account for
 * this lot when it has none yet, sized from the mint's own extensions, plus
 * the signature and priority fees; the rent comes back if that account is
 * ever closed. Returns that SOL floor, so a batch can check the sum: each
 * leg passing alone does not mean the wallet can pay for all of them.
 */
async function refuseUnfunded(
  connection: Connection,
  lot: Admission,
  mint: string,
  inAtoms: bigint,
  networkFeeLamports: bigint,
  [walletAccount, usdcAccount, lotAccount]: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>>,
): Promise<bigint> {
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
  const needed = rent + networkFeeLamports;
  const held = BigInt(walletAccount?.lamports ?? 0);
  if (held < needed) {
    const opening = rent > 0n ? `${formatAmount(rent, 9)} SOL to open its ${symbol} account (returned if that account is closed) and ` : "";
    throw new Refusal(402, `Add at least ${formatAmount(needed - held, 9)} SOL. Buying ${symbol} needs ${formatAmount(needed, 9)} SOL: ${opening}${formatAmount(needed - rent, 9)} SOL in network fees. This wallet holds ${formatAmount(held, 9)} SOL, and fees and new accounts are paid in SOL, not USDC.`);
  }
  return needed;
}

type JupiterSwap = { swapTransaction: string; lastValidBlockHeight: number; prioritizationFeeLamports?: number };

/**
 * A leg ready to simulate and sign. landing "sender" carries the holder's
 * tip to Helius Sender and is sent there; "rpc" is Jupiter's own
 * transaction, sent through the RPC. blockhashBy is taken just before the
 * blockhash is fetched, so a signing window counted from it closes no later
 * than the blockhash does.
 */
type Built = { transaction: VersionedTransaction; lastValidBlockHeight: number; blockhashBy: Date; prioritizationFeeLamports: number; landing: "sender" | "rpc" };
type Routed = { quote: JupiterQuote; built: Built; simulation: Awaited<ReturnType<Connection["simulateTransaction"]>>; receivedAt: Date };

/** SOL the holder's wallet pays to send the leg: signatures, the route's priority fee and, through Sender, the tip. */
function sendingLamports(built: Built): bigint {
  return signatureFeeLamports(built.transaction) + BigInt(built.prioritizationFeeLamports) + (built.landing === "sender" ? BigInt(SENDER_TIP_LAMPORTS) : 0n);
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
let tipValue: { usdcAtoms: Promise<bigint>; at: number } | undefined;

/**
 * Sender's tip in USDC atoms, rounded up, from one Jupiter quote of 1 SOL
 * reused for TIP_VALUE_TTL_MS: one more request a minute against Jupiter's
 * one a second, rather than one per leg. A failed quote is not kept.
 */
function senderTipUsdcAtoms(config: AllocationConfig): Promise<bigint> {
  if (tipValue && Date.now() - tipValue.at < TIP_VALUE_TTL_MS) return tipValue.usdcAtoms;
  const query = new URLSearchParams({ inputMint: SOL_MINT, outputMint: USDC_MINT, amount: "1000000000", slippageBps: String(SLIPPAGE_BPS) });
  const entry = {
    usdcAtoms: jupiter<JupiterQuote>(config.jupiterApiKey, `/quote?${query}`).then((quote) => (BigInt(quote.outAmount) * BigInt(SENDER_TIP_LAMPORTS) + 999_999_999n) / 1_000_000_000n),
    at: Date.now(),
  };
  entry.usdcAtoms.catch(() => { if (tipValue === entry) tipValue = undefined; });
  tipValue = entry;
  return entry.usdcAtoms;
}

/**
 * Builds the leg for Sender: Jupiter's swap instructions with the holder's
 * tip last. Undefined when the route will not fit a packet with the tip,
 * which the caller answers with Jupiter's own build.
 */
async function buildForSender(config: AllocationConfig, connection: Connection, wallet: PublicKey, swapBody: string): Promise<Built | undefined> {
  const parts = await jupiter<JupiterInstructions>(config.jupiterApiKey, "/swap-instructions", { method: "POST", body: swapBody });
  const tables = await Promise.all(parts.addressLookupTableAddresses.map(async (address) => {
    const table = (await connection.getAddressLookupTable(new PublicKey(address))).value;
    if (!table) throw new Refusal(502, `The route Jupiter built names lookup table ${address}, which mainnet does not hold, so it was not offered for signing.`);
    return table;
  }));
  const blockhashBy = new Date();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const transaction = composeSwap({ wallet, tipAccount: senderTipAccount(randomInt(SENDER_TIP_ACCOUNTS.length)), parts, lookupTables: tables, blockhash });
  if (!transaction) return undefined;
  return { transaction, lastValidBlockHeight, blockhashBy, prioritizationFeeLamports: parts.prioritizationFeeLamports ?? 0, landing: "sender" };
}

async function buildWithJupiter(config: AllocationConfig, swapBody: string): Promise<Built> {
  const blockhashBy = new Date();
  const swap = await jupiter<JupiterSwap>(config.jupiterApiKey, "/swap", { method: "POST", body: swapBody });
  return {
    transaction: VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64")),
    lastValidBlockHeight: swap.lastValidBlockHeight,
    blockhashBy,
    prioritizationFeeLamports: swap.prioritizationFeeLamports ?? 0,
    landing: "rpc",
  };
}

let venueLabels: Promise<Record<string, string>> | undefined;

/** The trading venue whose program failed in these logs, by Jupiter's own label for it. */
async function refusingVenue(config: AllocationConfig, logs: string[]): Promise<string | undefined> {
  const failed = failedVenueProgram(logs);
  if (!failed) return undefined;
  venueLabels ??= jupiter<Record<string, string>>(config.jupiterApiKey, "/program-id-to-label").catch(() => ({}));
  return (await venueLabels)[failed];
}

/**
 * Quotes, builds, checks and simulates one swap. When the simulation fails
 * inside one trading venue, the swap is quoted once more with that venue
 * excluded: on 13 October 2026 GoonFi V2 refused three legs at once with
 * custom error 0x15 while the same route simulated cleanly minutes later,
 * so one venue's moment is not a reason to refuse the leg. A second
 * failure is refused in plain words, with the program's account kept as
 * technical detail. `beforeSimulating` runs the caller's funding checks on
 * each built swap, since its priority fee is part of what the wallet pays.
 *
 * With Sender configured, the route is capped at SENDER_MAX_ACCOUNTS and
 * built with the tip for Sender; a route that still will not fit falls back
 * to Jupiter's own build sent through the RPC, as every leg was before
 * Sender, and keeps the lowered fee it was quoted at.
 *
 * `feeAccount` is undefined when the tip took the whole fee: Jupiter
 * refuses a fee account with a zero platform fee ("platformFee must be
 * greater than 0 when feeAccount is set", measured 14 October 2026).
 */
async function routeAndSimulate(
  config: AllocationConfig,
  connection: Connection,
  wallet: PublicKey,
  query: URLSearchParams,
  feeAccount: PublicKey | undefined,
  watched: PublicKey[],
  subject: string,
  beforeSimulating: (built: Built) => Promise<void>,
): Promise<Routed> {
  if (config.senderUrl) query.set("maxAccounts", String(SENDER_MAX_ACCOUNTS));
  let avoided: string | undefined;
  for (;;) {
    const quote = await jupiter<JupiterQuote>(config.jupiterApiKey, `/quote?${query}`);
    const receivedAt = new Date();
    const swapBody = JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.toBase58(), dynamicComputeUnitLimit: true, feeAccount: feeAccount?.toBase58(), prioritizationFeeLamports: PRIORITY_FEE });
    const built = (config.senderUrl ? await buildForSender(config, connection, wallet, swapBody) : undefined) ?? (await buildWithJupiter(config, swapBody));
    const transaction = built.transaction;
    const unlisted = unlistedProgram(transaction);
    if (unlisted) throw new Refusal(502, `The route Jupiter built for ${subject} invokes ${unlisted}, which is not on this deployment's program allowlist, so it was not offered for signing.`);
    if (!transaction.message.staticAccountKeys[0]?.equals(wallet)) throw new Refusal(502, `The route Jupiter built for ${subject} is not paid for by the connected wallet, so it was not offered for signing.`);
    await beforeSimulating(built);
    const simulate = (candidate: VersionedTransaction) => connection.simulateTransaction(candidate, {
      sigVerify: false,
      replaceRecentBlockhash: false,
      commitment: "confirmed",
      accounts: { encoding: "base64", addresses: watched.map((key) => key.toBase58()) },
    });
    let signable = transaction;
    let simulation = await simulate(signable);
    // A Sender leg was built at the loaded data ceiling; this run measured
    // it, so the leg the holder signs carries the measurement, and is
    // simulated again because the approval covers only what was simulated.
    // An RPC that does not report the measurement leaves the ceiling, which
    // is still explicit. Jupiter's own RPC build carries no limit to tighten.
    const measured = (simulation.value as { loadedAccountsDataSize?: number }).loadedAccountsDataSize;
    if (!simulation.value.err && loadedDataLimitOf(signable) !== undefined && typeof measured === "number" && measured > 0) {
      signable = withLoadedDataLimit(signable, loadedDataLimit(measured));
      simulation = await simulate(signable);
    }
    if (!simulation.value.err) return { quote, built: { ...built, transaction: signable }, simulation, receivedAt };

    const logs = simulation.value.logs ?? [];
    const venue = await refusingVenue(config, logs);
    if (venue && !avoided) {
      avoided = venue;
      query.set("excludeDexes", venue);
      continue;
    }
    const technical = `${JSON.stringify(simulation.value.err)}${logs.filter((line) => /error|failed/i.test(line)).slice(-2).map((line) => ` | ${line}`).join("")}`;
    const plain = avoided
      ? `${avoided} refused ${subject} when Seametry tested it on mainnet, and the route around it failed too.`
      : venue
        ? `${venue} refused ${subject} when Seametry tested it on mainnet.`
        : `${subject[0].toUpperCase()}${subject.slice(1)} failed when Seametry tested it on mainnet.`;
    throw new Refusal(422, `${plain} Nothing was signed or spent; try again in a minute. Technical detail: ${technical}`);
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
  /** Scale of inAtoms: USDC's on a purchase, the lot's on a sale. */
  inScale: number;
  /** The block height after which this transaction can never land, from Jupiter's /swap or the blockhash Sender's build used. */
  lastValidBlockHeight: number;
  priorityFeeLamports: string;
  /** How the leg reaches mainnet: through Helius Sender with a tip, or through the RPC. */
  landing: "sender" | "rpc";
  /** Lamports this leg's transaction tips Sender from the holder's wallet; "0" for an RPC leg. */
  tipLamports: string;
  /**
   * Set on purchases only, where a batch sums it: SOL this leg spends or
   * locks, rent for a new holding account plus signature and priority fees
   * and any tip.
   */
  solNeededLamports?: string;
  /** What this leg was quoted at: the plan size's tier less tipOffsetBps. */
  routingFeeBps: number;
  /** Basis points taken off the tier so the routing fee covers the tip; 0 without Sender. */
  tipOffsetBps: number;
  /** USDC atoms the simulation moved into Seametry's fee account. */
  routingFeeAtoms: string;
  simulated: BalanceChange[];
  transaction: string;
  approval: string;
  /** Set by the prepare route: the activity record's id for this request, which the browser's funnel steps name. */
  quoteId?: string;
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
  const tierBps = routingFeeBps(plan.size);
  const tipBps = config.senderUrl ? tipOffsetBps(await senderTipUsdcAtoms(config), inAtoms, tierBps) : 0;
  const feeBps = tierBps - tipBps;

  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  // The fee is paid into the fee wallet's USDC account; Jupiter will not open
  // it, so a missing one is refused here, before any quote, as Seametry's to fix.
  const feeAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(config.feeWallet), true, new PublicKey(USDC_TOKEN_PROGRAM));
  if (!(await connection.getAccountInfo(feeAccount, "confirmed"))) {
    throw new Refusal(503, `Seametry's routing fee account ${feeAccount.toBase58()} is not open on mainnet, so no leg can be prepared; Seametry has to open it.`);
  }

  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), wallet, false, new PublicKey(USDC_TOKEN_PROGRAM));
  const lotAccount = getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, new PublicKey(lot.token_program));
  // The fee account is watched too: the fee shown is what simulation moves
  // into it, not a figure computed beside the transaction.
  const watched = [wallet, usdcAccount, lotAccount, feeAccount];
  const before = await connection.getMultipleAccountsInfo(watched, "confirmed");

  let solNeeded = 0n;
  const { quote, built, simulation, receivedAt } = await routeAndSimulate(
    config, connection, wallet, quoteParams(mint, inAtoms, feeBps), feeBps > 0 ? feeAccount : undefined, watched, `buying ${lot.instrument.symbol ?? mint}`,
    // Checked before simulating because simulation reports a short wallet as
    // the System program's error 0x1 inside the account opening instruction,
    // which names neither the shortfall nor what to do about it.
    async (candidate) => { solNeeded = await refuseUnfunded(connection, lot, mint, inAtoms, sendingLamports(candidate), before); },
  );
  const expiresAt = new Date(built.blockhashBy.getTime() + SIGNING_WINDOW_MS);
  const after = simulation.value.accounts ?? [];
  const accountData = (index: number) => {
    const data = after[index]?.data;
    return Array.isArray(data) ? Buffer.from(data[0], "base64") : null;
  };
  const simulated: BalanceChange[] = [
    { atoms: (tokenAmount(accountData(1)) - tokenAmount(before[1]?.data)).toString(), scale: 6, unit: "USDC" },
    { atoms: (tokenAmount(accountData(2)) - tokenAmount(before[2]?.data)).toString(), scale: lot.decimals, unit: lot.instrument.symbol ?? mint },
  ];
  const feeAtoms = tokenAmount(accountData(3)) - tokenAmount(before[3]?.data);

  const now = new Date();
  if (now > expiresAt) throw new Refusal(410, "This quote expired. Refresh to see current terms.");

  const approval = signApproval(
    {
      direction: "buy",
      wallet: wallet.toBase58(),
      mint,
      inputDigest: lot.capacity_decision.input_digest,
      policyVersion: lot.capacity_decision.policy_version,
      inAtoms: quote.inAmount,
      outAtoms: quote.outAmount,
      floorAtoms: quote.otherAmountThreshold,
      messageSha256: messageDigest(built.transaction.message.serialize()),
      expiresAt: expiresAt.toISOString(),
    },
    config.approvalSecret,
  );

  return {
    mint,
    symbol: lot.instrument.symbol ?? mint,
    inAtoms: quote.inAmount,
    inScale: USDC_SCALE,
    outAtoms: quote.outAmount,
    floorAtoms: quote.otherAmountThreshold,
    outScale: lot.decimals,
    route: quote.routePlan.map((hop) => hop.swapInfo.label),
    contextSlot: quote.contextSlot,
    receivedAt: receivedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastValidBlockHeight: built.lastValidBlockHeight,
    priorityFeeLamports: String(built.prioritizationFeeLamports),
    landing: built.landing,
    tipLamports: built.landing === "sender" ? String(SENDER_TIP_LAMPORTS) : "0",
    solNeededLamports: solNeeded.toString(),
    routingFeeBps: feeBps,
    tipOffsetBps: tipBps,
    routingFeeAtoms: feeAtoms.toString(),
    simulated,
    transaction: Buffer.from(built.transaction.serialize()).toString("base64"),
    approval,
  };
}

/**
 * Checks the whole Allocation spend before preparing any signatures, then
 * prepares every independently executable leg. This keeps "one decision"
 * honest: the wallet never signs a set whose combined USDC spend was already
 * larger than its observed balance.
 */
export async function prepareBatch(
  config: AllocationConfig,
  walletText: string,
  legs: { mint: string; inAtoms: bigint }[],
  planMints: string[],
): Promise<PreparedLeg[]> {
  if (legs.length === 0) throw new Refusal(400, "An Allocation needs at least one constituent.");
  if (new Set(legs.map((leg) => leg.mint)).size !== legs.length) throw new Refusal(400, "The Allocation names a constituent more than once.");
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletText);
  } catch {
    throw new Refusal(400, '"' + walletText + '" is not a Solana address.');
  }

  const requested = legs.reduce((sum, leg) => sum + leg.inAtoms, 0n);
  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), wallet, false, new PublicKey(USDC_TOKEN_PROGRAM));
  const held = tokenAmount((await connection.getAccountInfo(usdcAccount, "confirmed"))?.data);
  if (held < requested) {
    throw new Refusal(402, "This wallet holds " + formatAmount(held, 6) + " USDC; the Allocation requires " + formatAmount(requested, 6) + " USDC.");
  }

  const prepared = await Promise.all(legs.map((leg) => prepareLeg(config, walletText, leg.mint, leg.inAtoms, planMints)));
  // Each leg checked the SOL it needs alone. Signed together they need the
  // sum, and a wallet short of it would settle some legs and fail the rest.
  const solNeeded = prepared.reduce((sum, leg) => sum + BigInt(leg.solNeededLamports ?? "0"), 0n);
  const solHeld = BigInt(await connection.getBalance(wallet, "confirmed"));
  if (solHeld < solNeeded) {
    throw new Refusal(402, `Add at least ${formatAmount(solNeeded - solHeld, 9)} SOL, or buy fewer constituents. The ${prepared.length} purchases need ${formatAmount(solNeeded, 9)} SOL together, for new token accounts (returned if closed) and network fees; this wallet holds ${formatAmount(solHeld, 9)} SOL, and those are paid in SOL, not USDC.`);
  }
  return prepared;
}

/** Builds an exact-input reverse swap. A current admission block does not hide a holder's exit route. */
export async function prepareSale(config: AllocationConfig, walletText: string, mint: string, inAtoms: bigint): Promise<PreparedLeg> {
  const lot = listedLot(mint);
  if (inAtoms <= 0n) throw new Refusal(400, `Selling ${lot.instrument.symbol ?? mint} needs a token quantity greater than zero.`);
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletText);
  } catch {
    throw new Refusal(400, `"${walletText}" is not a Solana address.`);
  }
  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  const feeAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), new PublicKey(config.feeWallet), true, new PublicKey(USDC_TOKEN_PROGRAM));
  if (!(await connection.getAccountInfo(feeAccount, "confirmed"))) throw new Refusal(503, "Seametry's USDC fee account is not open on mainnet. Seametry must open it before selling here is available.");

  const tierBps = routingFeeBps(1);
  const usdcAccount = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), wallet, false, new PublicKey(USDC_TOKEN_PROGRAM));
  const lotAccount = getAssociatedTokenAddressSync(new PublicKey(mint), wallet, false, new PublicKey(lot.token_program));
  const watched = [wallet, usdcAccount, lotAccount, feeAccount];
  const before = await connection.getMultipleAccountsInfo(watched, "confirmed");
  const held = tokenAmount(before[2]?.data);
  if (held < inAtoms) throw new Refusal(402, `This wallet holds ${formatAmount(held, lot.decimals)} ${lot.instrument.symbol ?? mint}; the sale asks for ${formatAmount(inAtoms, lot.decimals)}.`);
  const rent = before[1] ? 0n : BigInt(await connection.getMinimumBalanceForRentExemption(165));
  // A sale's fee comes out of the USDC it receives, which is unknown until
  // quoted, so one quote at the full tier sizes the tip's offset. That costs
  // one more Jupiter request per sale, at one a second.
  let tipBps = 0;
  if (config.senderUrl) {
    const sized = await jupiter<JupiterQuote>(config.jupiterApiKey, `/quote?${sellQuoteParams(mint, inAtoms, tierBps)}`);
    tipBps = tipOffsetBps(await senderTipUsdcAtoms(config), BigInt(sized.outAmount), tierBps);
  }
  const feeBps = tierBps - tipBps;

  const { quote, built, simulation, receivedAt } = await routeAndSimulate(
    config, connection, wallet, sellQuoteParams(mint, inAtoms, feeBps), feeBps > 0 ? feeAccount : undefined, watched, `selling ${lot.instrument.symbol ?? mint}`,
    async (candidate) => {
      const needed = rent + sendingLamports(candidate);
      const solHeld = BigInt(before[0]?.lamports ?? 0);
      if (solHeld < needed) throw new Refusal(402, `This wallet holds ${formatAmount(solHeld, 9)} SOL; the sale needs ${formatAmount(needed, 9)} SOL for network fees${rent ? " and a USDC token account" : ""}. Add SOL before selling.`);
    },
  );
  const expiresAt = new Date(built.blockhashBy.getTime() + SIGNING_WINDOW_MS);
  const after = simulation.value.accounts ?? [];
  const accountData = (index: number) => {
    const data = after[index]?.data;
    return Array.isArray(data) ? Buffer.from(data[0], "base64") : null;
  };
  const simulated: BalanceChange[] = [
    { atoms: (tokenAmount(accountData(2)) - tokenAmount(before[2]?.data)).toString(), scale: lot.decimals, unit: lot.instrument.symbol ?? mint },
    { atoms: (tokenAmount(accountData(1)) - tokenAmount(before[1]?.data)).toString(), scale: 6, unit: "USDC" },
  ];
  const feeAtoms = tokenAmount(accountData(3)) - tokenAmount(before[3]?.data);
  if (new Date() > expiresAt) throw new Refusal(410, "This sale quote expired. Request current terms before signing.");
  const approval = signApproval({
    direction: "sell", wallet: wallet.toBase58(), mint,
    inputDigest: lot.capacity_decision.input_digest, policyVersion: lot.capacity_decision.policy_version,
    inAtoms: quote.inAmount, outAtoms: quote.outAmount, floorAtoms: quote.otherAmountThreshold,
    messageSha256: messageDigest(built.transaction.message.serialize()), expiresAt: expiresAt.toISOString(),
  }, config.approvalSecret);
  return {
    mint, symbol: lot.instrument.symbol ?? mint, inAtoms: quote.inAmount, inScale: lot.decimals, outAtoms: quote.outAmount,
    floorAtoms: quote.otherAmountThreshold, outScale: 6, route: quote.routePlan.map((hop) => hop.swapInfo.label),
    contextSlot: quote.contextSlot, receivedAt: receivedAt.toISOString(), expiresAt: expiresAt.toISOString(), lastValidBlockHeight: built.lastValidBlockHeight,
    priorityFeeLamports: String(built.prioritizationFeeLamports), landing: built.landing, tipLamports: built.landing === "sender" ? String(SENDER_TIP_LAMPORTS) : "0", routingFeeBps: feeBps,
    tipOffsetBps: tipBps, routingFeeAtoms: feeAtoms.toString(), simulated, transaction: Buffer.from(built.transaction.serialize()).toString("base64"), approval,
  };
}

/**
 * Prepares every leg of a sale in one request, so one server instance paces
 * all of their Jupiter calls. Sell All sent a request per leg, Vercel could
 * serve them on separate instances, and together their calls passed
 * Jupiter's limit on every attempt (15 October 2026).
 */
export async function prepareSales(config: AllocationConfig, walletText: string, legs: { mint: string; inAtoms: bigint }[]): Promise<PreparedLeg[]> {
  if (legs.length === 0) throw new Refusal(400, "A sale needs at least one holding to sell.");
  if (new Set(legs.map((leg) => leg.mint)).size !== legs.length) throw new Refusal(400, "The sale names a holding more than once.");
  return Promise.all(legs.map((leg) => prepareSale(config, walletText, leg.mint, leg.inAtoms)));
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
  const lot = terms.direction === "sell" ? listedLot(terms.mint) : admittedLot(terms.mint);
  if (lot.capacity_decision.input_digest !== terms.inputDigest || lot.capacity_decision.policy_version !== terms.policyVersion) {
    throw new Refusal(409, "The admission this leg was approved under has changed since. Prepare the leg again.");
  }
  const signature = transaction.signatures[0];
  if (!signature || signature.every((byte) => byte === 0)) {
    throw new Refusal(400, "The transaction carries no signature from the connected wallet.");
  }

  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  if (config.senderUrl && carriesSenderTip(transaction)) {
    return sendThroughSender(config, config.senderUrl, connection, transaction);
  }
  try {
    return await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 });
  } catch (error) {
    const technical = error instanceof Error ? error.message : String(error);
    // web3.js raises SendTransactionError with the simulation's logs when the
    // RPC's preflight refuses: that happens before broadcast, so the leg
    // certainly reached nothing. Anything else (a lost connection, a timeout)
    // may have been broadcast, and stays the watcher's to settle.
    if (!(error instanceof SendTransactionError) || !/Simulation failed/.test(technical)) {
      throw new Refusal(502, "Seametry could not confirm mainnet received it, so it is watched until its deadline.", { technical });
    }
    throw new Refusal(422, await preflightSentence(config, technical, error.logs ?? []), { notSent: true, technical });
  }
}

/**
 * Sends a tipped leg through Helius Sender. The leg is first simulated
 * through the RPC with signatures verified, which is the same check the
 * RPC's own preflight makes, so a refusal still ends the leg as not sent
 * with its plain reason. Sender is then asked to send without a preflight
 * of its own. Only explicit protocol-validation refusals prove it took
 * nothing; ambiguous errors and lost responses stay the watcher's.
 */
async function sendThroughSender(config: AllocationConfig, url: string, connection: Connection, transaction: VersionedTransaction): Promise<string> {
  const check = await connection.simulateTransaction(transaction, { sigVerify: true, replaceRecentBlockhash: false, commitment: "confirmed" });
  if (check.value.err) {
    const logs = check.value.logs ?? [];
    const technical = `Simulation failed. ${JSON.stringify(check.value.err)}${logs.filter((line) => /error|failed/i.test(line)).slice(-3).map((line) => ` | ${line}`).join("")}`;
    throw new Refusal(422, await preflightSentence(config, technical, logs), { notSent: true, technical });
  }
  return broadcastSender(url, transaction);
}

/** The plain account of a preflight refusal, naming the venue by Jupiter's label when one refused. */
async function preflightSentence(config: AllocationConfig, message: string, logs: string[]): Promise<string> {
  const refusal = preflightRefusal(message, logs);
  switch (refusal.kind) {
    case "slippage":
      return `The price moved more than the ${formatAmount(BigInt(SLIPPAGE_BPS), 2)}% slippage limit between the quote and sending, so mainnet's check stopped it. A fresh quote usually goes through.`;
    case "venue":
      return `${(await refusingVenue(config, logs)) ?? "The trading venue on its route"} refused it when mainnet checked it before sending. A fresh quote may route around it.`;
    case "expired":
      return "Its quote aged out before it reached mainnet. A fresh quote is needed.";
    case "unfunded":
      return "The wallet could not pay for it by the time it was sent. Add SOL or USDC and try again.";
    case "other":
      return "Mainnet's check refused it before sending.";
  }
}
