import { VersionedTransaction } from "@solana/web3.js";
import { formatAmount } from "../amount";

// ENGINEERING_STANDARD.md section 11, applied in this app's route handlers
// until the Go Execution service exists (API.md step A7). Pure, so each rule
// is tested without a network: tests/allocation-rules.spec.ts.

/** Mainnet USDC, the one input an Allocation spends. Matches the input of every captured quote in shared/fixtures/jupiter. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_SCALE = 6;
export const USDC_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Platform floor for a single swap. Routes may require more at quote time. */
export const MIN_LEG_USDC_ATOMS = 1_000_000n;

export function minimumPlanAtoms(constituents: number): bigint {
  return BigInt(constituents) * MIN_LEG_USDC_ATOMS;
}

/**
 * 50 basis points, the slippage every captured depth quote was requested at.
 * An assumption stated on the page, not a policy value yet.
 */
export const SLIPPAGE_BPS = 50;

/** Jupiter V2 is required when a fee-bearing route buys a Token-2022 lot. */
export function quoteParams(mint: string, inAtoms: bigint, feeBps: number): URLSearchParams {
  return new URLSearchParams({
    inputMint: USDC_MINT,
    outputMint: mint,
    amount: inAtoms.toString(),
    slippageBps: String(SLIPPAGE_BPS),
    platformFeeBps: String(feeBps),
    instructionVersion: "V2",
  });
}

/**
 * Seametry's routing fee in basis points of the USDC each leg spends, by how
 * many constituents the plan buys, set by Storm on 7 October 2026: capped at
 * 25, and lower for a basket, since buying several together is what only
 * Seametry does. It replaced a flat 50 the same day, after comparison with
 * Kraken, Backpack and Jupiter Mobile at 0 to 20. Jupiter takes it from the
 * input in USDC and pays it to the fee wallet's USDC account (platformFeeBps
 * and feeAccount, developers.jup.ag/docs/swap-api/add-fees-to-swap). It is a
 * line on the order sheet and in every prepared leg; MOBILE.md section 11
 * forbids a fee anyone has to discover. Ordered widest basket first.
 */
export const ROUTING_FEE_TIERS = [
  { fromConstituents: 5, bps: 10 },
  { fromConstituents: 2, bps: 15 },
  { fromConstituents: 1, bps: 25 },
] as const;

/** The routing fee's basis points for a plan buying `constituents` distinct lots. */
export function routingFeeBps(constituents: number): number {
  return (ROUTING_FEE_TIERS.find((tier) => constituents >= tier.fromConstituents) ?? ROUTING_FEE_TIERS[ROUTING_FEE_TIERS.length - 1]).bps;
}

/** The schedule in words, from the table itself, so the page cannot state a rate the server does not charge. */
export function feeSchedule(): string {
  const ascending = [...ROUTING_FEE_TIERS].sort((a, b) => a.fromConstituents - b.fromConstituents);
  return ascending
    .map((tier, i) => {
      const next = ascending[i + 1];
      const span = !next ? `${tier.fromConstituents} or more` : next.fromConstituents - 1 === tier.fromConstituents ? `${tier.fromConstituents}` : `${tier.fromConstituents} to ${next.fromConstituents - 1}`;
      return `${formatAmount(BigInt(tier.bps), 2)}% for ${span}`;
    })
    .join(", ")
    .concat(" constituents");
}

/** The routing fee on `inAtoms` of USDC at `bps`, rounded down to whole atoms as Jupiter's integer arithmetic does. */
export function routingFeeAtoms(inAtoms: bigint, bps: number): bigint {
  return (inAtoms * BigInt(bps)) / 10_000n;
}

/**
 * How long a prepared leg may be signed and submitted. liquidity.DefaultTTL
 * is 15 seconds for quotes measured by a program; this path waits on a
 * person reading the simulated result and then their wallet's own prompt, so
 * it is longer. It stays well inside a blockhash's own lifetime.
 */
export const QUOTE_TTL_MS = 30_000;

/**
 * Top-level programs a prepared swap may invoke. Jupiter's aggregator reaches
 * every venue through its own program, so venues never appear here; anything
 * else Jupiter adds is refused, naming the program, until someone reads it
 * and lists it on purpose.
 */
export const PROGRAM_ALLOWLIST: ReadonlyMap<string, string> = new Map([
  ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "Jupiter aggregator v6"],
  ["ComputeBudget111111111111111111111111111111", "Compute budget"],
  ["ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", "Associated token account"],
  ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "Token"],
  ["TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", "Token-2022"],
  ["11111111111111111111111111111111", "System"],
]);

/**
 * The first program the transaction invokes that is not on the allowlist, or
 * undefined when every one is listed. A program id must be a static account
 * key (the runtime will not invoke one loaded from a lookup table), so no
 * lookup table has to be fetched to read them.
 */
export function unlistedProgram(transaction: VersionedTransaction): string | undefined {
  const keys = transaction.message.staticAccountKeys;
  for (const instruction of transaction.message.compiledInstructions) {
    const key = keys[instruction.programIdIndex];
    if (!key) return `account index ${instruction.programIdIndex}, which is not a static key`;
    const id = key.toBase58();
    if (!PROGRAM_ALLOWLIST.has(id)) return id;
  }
  return undefined;
}

/** Atoms of USDC one lot may spend, from its policy-issued measured capacity. */
export function lotCapAtoms(capacityUsdc: number): bigint {
  return BigInt(capacityUsdc) * 10n ** BigInt(USDC_SCALE);
}

export type CountryGate = { open: true; country: string } | { open: false; reason: string };

/**
 * Whether this request may prepare or submit a leg. Fails closed: no list
 * configured, or no country for the request, refuses, because an issuer's
 * exclusions cannot be honoured by a deployment that does not know them.
 */
export function countryGate(country: string | null, blockedList: string | undefined): CountryGate {
  if (blockedList === undefined || blockedList.trim() === "") {
    return {
      open: false,
      reason: "Purchases are unavailable because this deployment has no verified issuer eligibility policy.",
    };
  }
  const code = country?.trim().toUpperCase();
  if (!code) {
    return { open: false, reason: "The country this request comes from could not be determined, so nothing can be bought from it." };
  }
  const blocked = blockedList.split(",").map((entry) => entry.trim().toUpperCase()).filter(Boolean);
  if (blocked.includes(code)) {
    return { open: false, reason: `The issuers of these instruments exclude buyers in ${code}.` };
  }
  return { open: true, country: code };
}
