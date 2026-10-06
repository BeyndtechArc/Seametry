import type { Connection } from "@solana/web3.js";

const LANDING_POLL_MS = 2_000;

/**
 * Waits until devnet reports the founding or its blockhash expires, never a
 * fixed time. web3.js's confirmTransaction(signature) gives up after 30
 * seconds, and on 6 October 2026 it reported a timeout for Stoic Crew's
 * founding, which devnet had in fact finalized. A transaction can land until
 * its blockhash expires and can never land after, so that is the only honest
 * point to stop waiting.
 */
export async function awaitLanding(connection: Connection, signature: string, blockhash: string) {
  for (;;) {
    const status = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new Error(`The Hall refused the founding: ${JSON.stringify(status.err)} (transaction ${signature})`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    if (!status && !(await connection.isBlockhashValid(blockhash, { commitment: "confirmed" })).value) {
      // One last look: it may have landed in the slot the blockhash expired at.
      const last = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
      if (last && !last.err) return;
      throw new Error(`Founding ${signature} did not land: its blockhash expired before devnet received it.`);
    }
    await new Promise((resolve) => setTimeout(resolve, LANDING_POLL_MS));
  }
}
