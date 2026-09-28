import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, createFreezeAccountInstruction, createThawAccountInstruction } from "@solana/spl-token";
import { hallTokenAccount } from "./pda";

// No "server-only" guard, for the same reason as found.ts: no secret is read
// here, only Keypairs already obtained elsewhere, and this is only ever
// imported by route handlers.

/**
 * The issuer freezes the Hall's own account for one constituent
 * (HALL.md section 4.6, "freezes the Hall's account for a constituent"). This
 * is the mock issuer acting, never the holder: signed only by the derived
 * issuer key, fee paid by the demo funder.
 */
export async function freezeLeg(connection: Connection, funder: Keypair, issuer: Keypair, alloy: PublicKey, mint: PublicKey) {
  const account = hallTokenAccount(alloy, mint);
  const tx = new Transaction().add(
    createFreezeAccountInstruction(account, mint, issuer.publicKey, [], TOKEN_2022_PROGRAM_ID)
  );
  tx.feePayer = funder.publicKey;
  return sendAndConfirmTransaction(connection, tx, [funder, issuer], { commitment: "confirmed" });
}

/** The issuer releases the Hall's account (HALL.md section 4.6, "shown to holders" once released). */
export async function thawLeg(connection: Connection, funder: Keypair, issuer: Keypair, alloy: PublicKey, mint: PublicKey) {
  const account = hallTokenAccount(alloy, mint);
  const tx = new Transaction().add(
    createThawAccountInstruction(account, mint, issuer.publicKey, [], TOKEN_2022_PROGRAM_ID)
  );
  tx.feePayer = funder.publicKey;
  return sendAndConfirmTransaction(connection, tx, [funder, issuer], { commitment: "confirmed" });
}
