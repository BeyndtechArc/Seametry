import "server-only";

import { Connection, type ParsedTransactionWithMeta, type TokenBalance } from "@solana/web3.js";
import { judgeLeg, type BalanceChange, type Judgement } from "./record";

export type LegQuery = { signature: string; wallet: string; signedAt: string; lastValidBlockHeight?: number };
export type LegReading = Judgement & { signature: string; changes?: BalanceChange[] };

/** The wallet's net token change per mint in a confirmed transaction. */
function walletChanges(meta: NonNullable<ParsedTransactionWithMeta["meta"]>, wallet: string): BalanceChange[] {
  const totals = new Map<string, { atoms: bigint; scale: number }>();
  const add = (rows: TokenBalance[] | null | undefined, sign: bigint) => {
    for (const row of rows ?? []) {
      if (row.owner !== wallet) continue;
      const entry = totals.get(row.mint) ?? { atoms: 0n, scale: row.uiTokenAmount.decimals };
      entry.atoms += sign * BigInt(row.uiTokenAmount.amount);
      totals.set(row.mint, entry);
    }
  };
  add(meta.preTokenBalances, -1n);
  add(meta.postTokenBalances, 1n);
  return [...totals].filter(([, entry]) => entry.atoms !== 0n).map(([mint, entry]) => ({ mint, atoms: entry.atoms.toString(), scale: entry.scale }));
}

/**
 * Reads every open leg with one block height call and one status call,
 * whatever the number of legs. A leg read as landed also has its transaction
 * fetched once for the wallet's balance changes; the caller stops asking
 * about a leg once it is terminal, so that fetch is not repeated.
 */
export async function readLegs(rpcUrl: string, legs: LegQuery[], now: number): Promise<LegReading[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const blockHeight = await connection.getBlockHeight("confirmed");
  const { value: statuses } = await connection.getSignatureStatuses(legs.map((leg) => leg.signature), { searchTransactionHistory: true });
  return Promise.all(legs.map(async (leg, index): Promise<LegReading> => {
    const judged = judgeLeg(statuses[index] ?? null, blockHeight, leg, now);
    if (judged.phase !== "landed") return { signature: leg.signature, ...judged };
    const transaction = await connection.getParsedTransaction(leg.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return { signature: leg.signature, ...judged, ...(transaction?.meta ? { changes: walletChanges(transaction.meta, leg.wallet) } : {}) };
  }));
}
