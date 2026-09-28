import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ALLOY_SEED,
  CLAIM_SEED,
  HALL_PROGRAM_ID,
  LOCKED_SEED,
  SHARE_SEED,
} from "./constants";

/** chain/programs/hall's Alloy PDA: [ALLOY_SEED, sponsor, id_le_bytes]. */
export function alloyPda(sponsor: PublicKey, id: bigint) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(id);
  return PublicKey.findProgramAddressSync(
    [ALLOY_SEED, sponsor.toBuffer(), idBytes],
    HALL_PROGRAM_ID
  )[0];
}

/** chain/programs/hall's share mint PDA: [SHARE_SEED, alloy]. */
export function shareMintPda(alloy: PublicKey) {
  return PublicKey.findProgramAddressSync([SHARE_SEED, alloy.toBuffer()], HALL_PROGRAM_ID)[0];
}

/** chain/programs/hall's locked-genesis token account PDA: [LOCKED_SEED, alloy]. */
export function lockedSharesPda(alloy: PublicKey) {
  return PublicKey.findProgramAddressSync([LOCKED_SEED, alloy.toBuffer()], HALL_PROGRAM_ID)[0];
}

/** chain/programs/hall's Claim PDA: [CLAIM_SEED, alloy, owner]. */
export function claimPda(alloy: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [CLAIM_SEED, alloy.toBuffer(), owner.toBuffer()],
    HALL_PROGRAM_ID
  )[0];
}

/**
 * The Hall's own Associated Token Account for one constituent mint, owned by
 * the alloy PDA (allowOwnerOffCurve: true, since a PDA is never on the ed25519
 * curve). Created idempotently inside initialize_alloy
 * (admit_constituent in chain/programs/hall/src/instructions/initialize_alloy.rs)
 * and reused unchanged by create, redeem and withdraw: nothing here creates it,
 * this only derives the address every instruction agrees on.
 */
export function hallTokenAccount(alloy: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, alloy, true, TOKEN_2022_PROGRAM_ID);
}

/** A wallet's own ATA for a Token-2022 mint, owner on-curve. */
export function ownerTokenAccount(owner: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
}
