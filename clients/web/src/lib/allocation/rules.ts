import { VersionedTransaction } from "@solana/web3.js";

// ENGINEERING_STANDARD.md section 11, applied in this app's route handlers
// until the Go Execution service exists (API.md step A7). Pure, so each rule
// is tested without a network: tests/allocation-rules.spec.ts.

/** Mainnet USDC, the one input an Allocation spends. Matches the input of every captured quote in shared/fixtures/jupiter. */
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_SCALE = 6;
export const USDC_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/**
 * 50 basis points, the slippage every captured depth quote was requested at.
 * An assumption stated on the page, not a policy value yet.
 */
export const SLIPPAGE_BPS = 50;

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

/** Atoms of USDC one lot may spend: the policy's reference size, because depth is measured to that size and no further. */
export function lotCapAtoms(referenceUsdc: number): bigint {
  return BigInt(referenceUsdc) * 10n ** BigInt(USDC_SCALE);
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
      reason: "This deployment has no list of excluded countries, so it offers nothing. The operator sets ALLOCATION_BLOCKED_COUNTRIES from each issuer's own terms.",
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
