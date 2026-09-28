import { PublicKey } from "@solana/web3.js";

/**
 * Alloy is a zero-copy account (chain/programs/hall/src/state.rs,
 * `#[account(zero_copy)]`, IDL serialization "bytemuck", repr "c"): its wire
 * format is the raw C struct layout, not ordinary Borsh. Anchor's generic TS
 * account coder is built for Borsh; rather than depend on unverified bytemuck
 * support in the installed @coral-xyz/anchor version, this decodes the fixed
 * layout directly, offset by offset, matching state.rs field for field. Claim
 * is ordinary Borsh (#[account], not zero_copy) and is fetched through
 * program.account.claim instead; only Alloy needs this.
 */

const DISCRIMINATOR = 8;
const LEG_RECORD_SIZE = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8; // 160
export const MAX_CONSTITUENTS_ON_CHAIN = 12;

export interface DecodedLeg {
  mint: PublicKey;
  tokenProgram: PublicKey;
  hallAccount: PublicKey;
  ledger: bigint;
  pending: bigint;
  unclaimed: bigint;
  vestStart: bigint;
  vestEnd: bigint;
  claimIndex: bigint;
  claimEpoch: bigint;
}

export interface DecodedAlloy {
  sponsor: PublicKey;
  shareMint: PublicKey;
  id: bigint;
  version: bigint;
  createdAt: bigint;
  supply: bigint;
  lockedGenesis: bigint;
  constituentCount: number;
  legs: DecodedLeg[];
}

function readPubkey(data: Buffer, offset: number) {
  return new PublicKey(data.subarray(offset, offset + 32));
}

export function decodeAlloy(data: Buffer): DecodedAlloy {
  let o = DISCRIMINATOR;
  const sponsor = readPubkey(data, o);
  o += 32;
  o += 32; // sponsor_mark, not surfaced (no sponsor's mark yet, see the build note)
  const shareMint = readPubkey(data, o);
  o += 32;
  const id = data.readBigUInt64LE(o);
  o += 8;
  const version = data.readBigUInt64LE(o);
  o += 8;
  const createdAt = data.readBigInt64LE(o);
  o += 8;
  const supply = data.readBigUInt64LE(o);
  o += 8;
  const lockedGenesis = data.readBigUInt64LE(o);
  o += 8;
  const constituentCount = Number(data.readBigUInt64LE(o));
  o += 8;
  o += 1; // bump
  o += 7; // _reserved

  const legs: DecodedLeg[] = [];
  for (let i = 0; i < constituentCount; i++) {
    const base = o + i * LEG_RECORD_SIZE;
    let p = base;
    const mint = readPubkey(data, p);
    p += 32;
    const tokenProgram = readPubkey(data, p);
    p += 32;
    const hallAccount = readPubkey(data, p);
    p += 32;
    const ledger = data.readBigUInt64LE(p);
    p += 8;
    const pending = data.readBigUInt64LE(p);
    p += 8;
    const unclaimed = data.readBigUInt64LE(p);
    p += 8;
    const vestStart = data.readBigInt64LE(p);
    p += 8;
    const vestEnd = data.readBigInt64LE(p);
    p += 8;
    const claimIndexLow = data.readBigUInt64LE(p);
    p += 8;
    const claimIndexHigh = data.readBigUInt64LE(p);
    p += 8;
    const claimEpoch = data.readBigUInt64LE(p);
    legs.push({
      mint,
      tokenProgram,
      hallAccount,
      ledger,
      pending,
      unclaimed,
      vestStart,
      vestEnd,
      claimIndex: (claimIndexHigh << 64n) | claimIndexLow,
      claimEpoch,
    });
  }

  return { sponsor, shareMint, id, version, createdAt, supply, lockedGenesis, constituentCount, legs };
}

/**
 * ceil(shares * ledger / supply): what create requires of one constituent.
 * chain/programs/hall/src/recipe.rs, required_in. BigInt throughout: no
 * floating point for an amount, matching AGENTS.md and recipe.rs's own u128
 * intermediates (BigInt in JS has no width limit, so the same guarantee
 * holds without recipe.rs's explicit widening).
 */
export function requiredIn(ledger: bigint, shares: bigint, supply: bigint): bigint {
  if (supply === 0n) throw new Error("zero supply");
  const product = ledger * shares;
  return product / supply + (product % supply !== 0n ? 1n : 0n);
}

/** floor(shares * ledger / supply): what redeem credits of one constituent. recipe.rs, out. */
export function outOf(ledger: bigint, shares: bigint, supply: bigint): bigint {
  if (supply === 0n) throw new Error("zero supply");
  return (ledger * shares) / supply;
}
