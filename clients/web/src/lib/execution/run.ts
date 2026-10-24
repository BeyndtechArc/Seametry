import bs58 from "bs58";
import { VersionedTransaction } from "@solana/web3.js";
import type { PreparedLeg } from "../allocation/execution";
import { walletChanges } from "../allocation/wallet-changes";
import { funnel } from "../funnel";
import { executions } from "./store";
import type { Execution, ExecutionKind, Leg } from "./record";

export type Signer = {
  signAllTransactions?: <T extends VersionedTransaction>(transactions: T[]) => Promise<T[]>;
  signTransaction?: <T extends VersionedTransaction>(transaction: T) => Promise<T>;
  /** Read after signing: the wallet the page is connected to now. */
  connectedWallet: () => string | undefined;
};

/** Raised before anything is sent, so the sheet that asked can say nothing moved and stay open. */
export class NotSent extends Error {
  constructor(message: string, readonly declined = false) {
    super(message);
  }
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

/** Just over Helius Free's one sendTransaction a second, so consecutive RPC sends never meet in the same second. */
const RPC_SEND_SPACING_MS = 1_100;

const DECLINED = /user rejected|user denied|user declined|rejected the request/i;

async function sign(signer: Signer, transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> {
  try {
    if (signer.signAllTransactions) return await signer.signAllTransactions(transactions);
    if (!signer.signTransaction) throw new NotSent("This wallet does not offer transaction signing. Nothing was sent.");
    const signed: VersionedTransaction[] = [];
    for (const transaction of transactions) signed.push(await signer.signTransaction(transaction));
    return signed;
  } catch (error) {
    if (error instanceof NotSent) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (DECLINED.test(message)) throw new NotSent("You declined in your wallet. Nothing was sent.", true);
    throw new NotSent(`The wallet did not sign: ${message}. Nothing was sent.`);
  }
}

/**
 * Signs every prepared leg in one wallet approval where the wallet allows it,
 * checks the wallet changed nothing, records the execution, and sends each
 * leg. It returns once the record exists, so the caller can close its sheet;
 * sending continues and the watcher in the App shell takes the record from
 * there. Anything thrown is a NotSent: nothing reached the network.
 */
export async function approveAndSend({
  wallet,
  kind,
  subject,
  allocation,
  prepared,
  signer,
}: {
  wallet: string;
  kind: ExecutionKind;
  subject: string;
  allocation?: Execution["allocation"];
  prepared: PreparedLeg[];
  signer: Signer;
}): Promise<Execution> {
  const originals = prepared.map((leg) => VersionedTransaction.deserialize(fromBase64(leg.transaction)));
  const step = { wallet, quoteId: prepared[0]?.quoteId };
  funnel("signature_requested", step);
  let signed: VersionedTransaction[];
  try {
    signed = await sign(signer, originals);
  } catch (error) {
    funnel(error instanceof NotSent && error.declined ? "signature_declined" : "signature_failed", step);
    throw error;
  }
  if (signed.length !== originals.length) throw new NotSent(`The wallet returned ${signed.length} of ${originals.length} transactions. Nothing was sent.`);
  // Phantom adds guard instructions to a transaction it can simulate; the
  // trade itself must be exactly what Seametry checked (wallet-changes.ts).
  for (const [index, transaction] of signed.entries()) {
    const change = walletChanges(originals[index].message, transaction.message);
    if (change) throw new NotSent(`The wallet changed the ${prepared[index].symbol} transaction Seametry checked: ${change}. Nothing was sent.`);
  }
  if (signer.connectedWallet() !== wallet) throw new NotSent("The connected wallet changed while signing. Nothing was sent.");

  const signedAt = new Date().toISOString();
  const legs: Leg[] = prepared.map((leg, index) => {
    const first = signed[index].signatures[0];
    const unsigned = !first || first.every((byte) => byte === 0);
    const tokenUnit = kind === "buy" ? leg.symbol : "USDC";
    return {
      signature: unsigned ? `unsigned-${index}-${signedAt}` : bs58.encode(first),
      mint: leg.mint,
      symbol: leg.symbol,
      spend: { atoms: leg.inAtoms, scale: leg.inScale, unit: kind === "buy" ? "USDC" : leg.symbol },
      expect: { out: { atoms: leg.outAtoms, scale: leg.outScale, unit: tokenUnit }, floor: { atoms: leg.floorAtoms, scale: leg.outScale, unit: tokenUnit } },
      lastValidBlockHeight: leg.lastValidBlockHeight,
      phase: unsigned ? "refused" : "signed",
      signedAt,
      ...(unsigned ? { endedAt: signedAt, problem: { plain: "The wallet returned this one unsigned, so it was not sent. Nothing moved." } } : {}),
    };
  });
  const execution: Execution = {
    id: legs.find((leg) => leg.phase === "signed")?.signature ?? `refused-${signedAt}`,
    kind,
    wallet,
    network: "mainnet",
    subject,
    ...(allocation ? { allocation } : {}),
    legs,
    createdAt: signedAt,
    seen: false,
  };
  executions.add(execution);

  // A Sender leg goes at once; Sender takes fifty a second. A leg falling back
  // to the RPC waits its turn: Helius's Free plan takes one send a second,
  // and sending a basket's legs together lost all but one (14 October 2026).
  const toRpc: number[] = [];
  legs.forEach((leg, index) => {
    if (leg.phase !== "signed") return;
    if (prepared[index].landing === "rpc") toRpc.push(index);
    else void send(execution.id, leg.signature, toBase64(signed[index].serialize()), prepared[index]);
  });
  void (async () => {
    for (const [turn, index] of toRpc.entries()) {
      if (turn > 0) await new Promise((resolve) => setTimeout(resolve, RPC_SEND_SPACING_MS));
      await send(execution.id, legs[index].signature, toBase64(signed[index].serialize()), prepared[index]);
    }
  })();
  return execution;
}

/**
 * A refusal the server marks sent:false is final: nothing reached the
 * network. Any other failure may have come after the broadcast, so the leg
 * is left for the watcher, which settles it either way by its deadline.
 */
/** Sends a signed leg with the transaction Seametry approved, which the server checks it against. */
async function send(executionId: string, signature: string, transaction: string, prepared: PreparedLeg) {
  let phase: Leg["phase"] = "sent";
  let problem: Leg["problem"];
  try {
    const response = await fetch("/api/allocation/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction, approved: prepared.transaction, approval: prepared.approval }) });
    const body = (await response.json().catch(() => ({}))) as { signature?: string; error?: string; sent?: boolean; technical?: string };
    if (!response.ok && body.sent === false) {
      phase = "refused";
      problem = { plain: `${body.error ?? "Seametry refused to send it."} Nothing moved.`, ...(body.technical ? { technical: body.technical } : {}) };
    }
  } catch {
    // The receipt was lost, not the transaction: the watcher reads the chain.
  }
  executions.update(executionId, (execution) => ({
    ...execution,
    legs: execution.legs.map((leg) => (leg.signature === signature && leg.phase === "signed" ? { ...leg, phase, ...(problem ? { problem, endedAt: new Date().toISOString() } : {}) } : leg)),
  }));
}
