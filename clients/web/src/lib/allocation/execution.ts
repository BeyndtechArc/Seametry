import "server-only";

import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { admissions, findAdmission, isAdmitted, type Admission } from "./admissions";
import { messageDigest, openApproval, signApproval } from "./approval";
import type { AllocationConfig } from "./config";
import { QUOTE_TTL_MS, SLIPPAGE_BPS, USDC_MINT, USDC_TOKEN_PROGRAM, lotCapAtoms, unlistedProgram } from "./rules";

// The Jupiter base the Go liquidity client uses (server/internal/liquidity/jupiter.go).
const JUPITER = "https://api.jup.ag/swap/v1";

/** A leg this server will not prepare or submit, with the reason a holder reads. */
export class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type JupiterQuote = {
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  contextSlot: number;
  routePlan: { swapInfo: { label: string } }[];
};

async function jupiter<T>(config: AllocationConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${JUPITER}${path}`, {
    ...init,
    headers: { "x-api-key": config.jupiterApiKey, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Refusal(502, `Jupiter answered ${response.status} for ${path.split("?")[0]}: ${detail}`);
  }
  return (await response.json()) as T;
}

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
  simulated: BalanceChange[];
  transaction: string;
  approval: string;
};

/**
 * Quotes, builds, checks and simulates one leg, and signs an approval over
 * exactly what was simulated. Every refusal names its reason. Nothing here
 * signs for the holder: the transaction goes back unsigned.
 */
export async function prepareLeg(config: AllocationConfig, walletText: string, mint: string, inAtoms: bigint): Promise<PreparedLeg> {
  const lot = admittedLot(mint);
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletText);
  } catch {
    throw new Refusal(400, `"${walletText}" is not a Solana address.`);
  }
  const cap = lotCapAtoms(admissions.reference_usdc);
  if (inAtoms <= 0n) throw new Refusal(400, "A leg must spend more than zero USDC.");
  if (inAtoms > cap) {
    throw new Refusal(400, `One lot may spend at most ${admissions.reference_usdc} USDC, the size its depth was measured to.`);
  }

  const query = new URLSearchParams({
    inputMint: USDC_MINT,
    outputMint: mint,
    amount: inAtoms.toString(),
    slippageBps: String(SLIPPAGE_BPS),
  });
  const quote = await jupiter<JupiterQuote>(config, `/quote?${query}`);
  const receivedAt = new Date();
  const expiresAt = new Date(receivedAt.getTime() + QUOTE_TTL_MS);

  const swap = await jupiter<{ swapTransaction: string; prioritizationFeeLamports?: number }>(config, "/swap", {
    method: "POST",
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: wallet.toBase58(), dynamicComputeUnitLimit: true }),
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
  const watched = [wallet, usdcAccount, lotAccount];

  const connection = new Connection(config.mainnetRpcUrl, "confirmed");
  const before = await connection.getMultipleAccountsInfo(watched, "confirmed");
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

  const now = new Date();
  if (now > expiresAt) throw new Refusal(410, "This quote expired. Refresh to see current terms.");

  const approval = signApproval(
    {
      wallet: wallet.toBase58(),
      mint,
      inputDigest: lot.decision.input_digest,
      policyVersion: lot.decision.policy_version,
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
  if (lot.decision.input_digest !== terms.inputDigest || lot.decision.policy_version !== terms.policyVersion) {
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
