import { AddressLookupTableAccount, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { SENDER_TIP_ACCOUNTS, SENDER_TIP_LAMPORTS, TRANSACTION_SIZE_LIMIT } from "./rules";
import bs58 from "bs58";
import { Refusal } from "../refusal";

// A leg sent through Helius Sender: Jupiter's swap instructions with one more,
// a tip from Seametry's tip wallet to a Sender tip account. Pure, so the shape
// is tested without a network (tests/allocation-rules.spec.ts); the server
// fetches the parts and signs for the tip wallet.

export type JupiterInstruction = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };

/** The /swap-instructions response, the parts a leg uses. */
export type JupiterInstructions = {
  computeBudgetInstructions: JupiterInstruction[];
  setupInstructions: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction | null;
  otherInstructions?: JupiterInstruction[];
  addressLookupTableAddresses: string[];
  prioritizationFeeLamports?: number;
};

function instruction(raw: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((account) => ({ pubkey: new PublicKey(account.pubkey), isSigner: account.isSigner, isWritable: account.isWritable })),
    data: Buffer.from(raw.data, "base64"),
  });
}

/** One of Sender's tip accounts, chosen by the caller so tests can fix it. */
export function senderTipAccount(index: number): PublicKey {
  return new PublicKey(SENDER_TIP_ACCOUNTS[Math.abs(index) % SENDER_TIP_ACCOUNTS.length]);
}

/**
 * The leg as one versioned transaction the holder pays for: compute budget,
 * account setup, the swap, cleanup, and last the tip, so the swap's own
 * instruction indices are the ones Jupiter built. Undefined when it would
 * not fit a packet, which the caller answers with Jupiter's RPC build.
 */
export function composeSwap({ wallet, tipPayer, tipAccount, parts, lookupTables, blockhash }: {
  wallet: PublicKey;
  tipPayer: PublicKey;
  tipAccount: PublicKey;
  parts: JupiterInstructions;
  lookupTables: AddressLookupTableAccount[];
  blockhash: string;
}): VersionedTransaction | undefined {
  const route = [
    ...parts.computeBudgetInstructions.map(instruction),
    ...parts.setupInstructions.map(instruction),
    instruction(parts.swapInstruction),
    ...(parts.cleanupInstruction ? [instruction(parts.cleanupInstruction)] : []),
    ...(parts.otherInstructions ?? []).map(instruction),
  ];
  // Signer privileges apply across the whole message, including CPI. Never
  // lend the sponsor's authority to any provider-supplied instruction.
  if (wallet.equals(tipPayer) || route.some((ix) => ix.programId.equals(tipPayer) || ix.keys.some((key) => key.pubkey.equals(tipPayer)))) {
    throw new Refusal(502, "The route cannot use Seametry's tip wallet for anything except its landing tip.", { notSent: true });
  }
  if (route.some((ix) => ix.keys.some((key) => key.isSigner && !key.pubkey.equals(wallet)))) {
    throw new Refusal(502, "The route asks for an unexpected signer, so it was not offered for signing.", { notSent: true });
  }
  if (!SENDER_TIP_ACCOUNTS.some((account) => account === tipAccount.toBase58())) throw new Error("Unknown Sender tip account.");
  try {
    const instructions = [...route, SystemProgram.transfer({ fromPubkey: tipPayer, toPubkey: tipAccount, lamports: SENDER_TIP_LAMPORTS })];
    const message = new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions }).compileToV0Message(lookupTables);
    const transaction = new VersionedTransaction(message);
    // Submit recognizes the tip without another lookup-table RPC request.
    // If compilation put the recipient in a table, use the untipped fallback.
    if (!carriesSenderTip(transaction, tipPayer)) return undefined;
    return transaction.serialize().length <= TRANSACTION_SIZE_LIMIT ? transaction : undefined;
  } catch {
    // web3.js throws when the message overruns its buffer: the same answer.
    return undefined;
  }
}

/** True when the transaction pays a Sender tip from this tip wallet, which is how submit knows where to send it. */
export function carriesSenderTip(transaction: VersionedTransaction, tipPayer: PublicKey): boolean {
  const { staticAccountKeys: keys, compiledInstructions, header } = transaction.message;
  const last = compiledInstructions.at(-1);
  if (!last || !keys[last.programIdIndex]?.equals(SystemProgram.programId) || last.accountKeyIndexes.length !== 2) return false;
  const [from, to] = last.accountKeyIndexes;
  const data = Buffer.from(last.data);
  return from > 0 && from < header.numRequiredSignatures && !!keys[from]?.equals(tipPayer)
    && SENDER_TIP_ACCOUNTS.some((account) => account === keys[to]?.toBase58()) && data.length === 12
    && data.readUInt32LE(0) === 2 && data.readBigUInt64LE(4) === BigInt(SENDER_TIP_LAMPORTS);
}

/** Base network fee, not the Sender tip. The holder pays for both signatures. */
export function signatureFeeLamports(transaction: VersionedTransaction): bigint {
  return BigInt(transaction.message.header.numRequiredSignatures) * 5_000n;
}

/** A keyed SWQOS endpoint; configuration errors never expose the supplied URL. */
export function senderEndpoint(rpcUrl: string, override?: string): string | undefined {
  if (override?.trim()) {
    let url: URL;
    try { url = new URL(override.trim()); } catch { throw new Error("HELIUS_SENDER_URL is not a valid Sender URL."); }
    if (url.protocol !== "https:" || !/^(?:[a-z]+-)?sender\.helius-rpc\.com$/.test(url.hostname)
      || url.pathname !== "/fast" || url.username || url.password || url.hash || url.port || !url.searchParams.get("api-key")) {
      throw new Error("HELIUS_SENDER_URL must be a keyed HTTPS Helius Sender /fast endpoint.");
    }
    url.searchParams.set("swqos_only", "true");
    return url.toString();
  }
  try {
    const rpc = new URL(rpcUrl);
    const key = rpc.searchParams.get("api-key");
    if (rpc.protocol !== "https:" || !(rpc.hostname === "helius-rpc.com" || rpc.hostname.endsWith(".helius-rpc.com")) || !key) return undefined;
    return `https://sender.helius-rpc.com/fast?api-key=${encodeURIComponent(key)}&swqos_only=true`;
  } catch { return undefined; }
}

/** Only call after signed preflight. An uncertain receipt must not enable a fresh purchase. */
export async function broadcastSender(url: string, transaction: VersionedTransaction, request: typeof fetch = fetch): Promise<string> {
  const expected = bs58.encode(transaction.signatures[0]);
  let response: Response;
  let answer: { jsonrpc?: string; id?: number; result?: string; error?: { code?: number } };
  const uncertain = () => new Refusal(502, "Seametry could not confirm Sender received it, so it is watched until its deadline.");
  try {
    response = await request(url, {
      method: "POST", headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(10_000), redirect: "error",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [Buffer.from(transaction.serialize()).toString("base64"), { encoding: "base64", skipPreflight: true, maxRetries: 0 }] }),
    });
    answer = await response.json();
  } catch { throw uncertain(); }
  if (!answer || answer.jsonrpc !== "2.0" || answer.id !== 1) throw uncertain();
  if (response.ok && !answer.error && answer.result === expected) return expected;
  // Only explicit protocol-validation refusals prove no submission. Unknown
  // server errors, timeouts, malformed or mismatched receipts remain watched.
  if (!answer.result && [-32700, -32600, -32601, -32602].includes(answer.error?.code ?? 0)) {
    throw new Refusal(503, "Sender refused the submission before sending. Prepare it again.", { notSent: true });
  }
  throw uncertain();
}
