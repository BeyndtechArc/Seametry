// The one record every buy and sell runs through
// (.plan/execution-and-interface-system.plan.md, section 3). Pure, so the
// rules are tested without a network or a browser: tests/execution.spec.ts.
// The interface renders these records; no component owns an execution's state.

import { USDC_MINT } from "../allocation/rules";

export type Quantity = { atoms: string; scale: number; unit: string };

/**
 * signed: the wallet signed it and Seametry has not yet had a send receipt.
 * sent: broadcast, or possibly broadcast (a lost receipt is not a refusal).
 * landed: confirmed on chain. failed: confirmed with an error, so the network
 * fee was charged and nothing else moved. dropped: never included before its
 * blockhash expired, so it can never land and nothing moved. refused: Seametry
 * refused to send it, so nothing moved.
 */
export type LegPhase = "signed" | "sent" | "landed" | "failed" | "dropped" | "refused";

export type Leg = {
  signature: string;
  mint: string;
  symbol: string;
  spend: Quantity;
  expect?: { out: Quantity; floor: Quantity };
  /** Absent only on records kept from before this engine; those fall back to DROPPED_AFTER_MS. */
  lastValidBlockHeight?: number;
  phase: LegPhase;
  signedAt: string;
  /** When the leg reached a terminal phase, read by the toast to linger briefly after the last one. */
  endedAt?: string;
  received?: Quantity;
  problem?: { plain: string; technical?: string };
  /**
   * The reconciler's answer for a leg from Seametry's record
   * (lib/execution/server-history.ts), as it wrote
   * it: landed settled, failed is a failure the chain confirmed, dropped
   * expired without mainnet ever seeing it. Absent means no answer yet.
   */
  chainAnswer?: "landed" | "failed" | "dropped";
};

export type ExecutionKind = "buy" | "sell";

export type Execution = {
  id: string;
  kind: ExecutionKind;
  wallet: string;
  network: "mainnet";
  /** The subject, without a verb: "Prime Seven", "AMZNx". */
  subject: string;
  /** Device-local attribution to the Allocation a leg belongs to. Never an ownership claim. */
  allocation?: { id: string; name: string; templateId?: string };
  legs: Leg[];
  createdAt: string;
  seen: boolean;
  /** Set while the chain cannot be read for this record's open legs. */
  unreadable?: { since: string; detail: string };
  /**
   * Absent for this browser's own record. "server" is Seametry's record of
   * what it prepared and sent; "chain" a trade found only in the fee
   * account's history. Neither is the browser's word.
   */
  recordedBy?: "server" | "chain";
};

export type ExecutionState = "settling" | "settled" | "partly-settled" | "nothing-moved" | "needs-attention";

const TERMINAL: ReadonlySet<LegPhase> = new Set(["landed", "failed", "dropped", "refused"]);

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

/** False for a leg the wallet returned unsigned, which carries a placeholder in place of a signature. */
export function hasSignature(leg: Leg): boolean {
  return SIGNATURE.test(leg.signature);
}

export function isTerminal(leg: Leg): boolean {
  return TERMINAL.has(leg.phase);
}

/** When the last leg ended, or undefined while any is open. */
export function endedAt(execution: Execution): number | undefined {
  if (!execution.legs.every(isTerminal)) return undefined;
  return Math.max(...execution.legs.map((leg) => Date.parse(leg.endedAt ?? execution.createdAt)));
}

/**
 * How long the chain may stay unreadable before the record says so instead of
 * "settling". Long enough to ride out a burst of 429s, short enough that
 * nobody stares at a spinner wondering.
 */
export const UNREADABLE_AFTER_MS = 45_000;

export function deriveState(execution: Execution, now: number): ExecutionState {
  const open = execution.legs.some((leg) => !isTerminal(leg));
  if (open) {
    return execution.unreadable && now - Date.parse(execution.unreadable.since) > UNREADABLE_AFTER_MS ? "needs-attention" : "settling";
  }
  const landed = execution.legs.filter((leg) => leg.phase === "landed").length;
  if (landed === execution.legs.length) return "settled";
  return landed > 0 ? "partly-settled" : "nothing-moved";
}

/**
 * How far past its last valid block height a signature must be unseen before
 * it is called dropped. A status read can lag the block it reports on by a
 * few slots, so a transaction that landed in the final valid block could
 * still read as unseen at exactly the deadline. 20 blocks is about 8 seconds.
 */
export const DROP_MARGIN_BLOCKS = 20;

/** Used only for records without a block height deadline: a blockhash lives 60 to 90 seconds. */
export const DROPPED_AFTER_MS = 5 * 60_000;

export type ChainStatus = { err: unknown; confirmationStatus?: string | null } | null;

export type Judgement =
  | { phase: "sent" }
  | { phase: "landed" }
  | { phase: "failed"; technical: string }
  | { phase: "dropped" };

/**
 * Where one signature stands, from one status read and the block height read
 * before it. The height must be read first: a height past the deadline
 * followed by an empty status means the transaction can never land, whereas
 * the other order could miss one that landed between the two reads.
 */
export function judgeLeg(status: ChainStatus, blockHeight: number, deadline: { lastValidBlockHeight?: number; signedAt: string }, now: number): Judgement {
  if (status) {
    if (status.err) return { phase: "failed", technical: JSON.stringify(status.err) };
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return { phase: "landed" };
    return { phase: "sent" };
  }
  if (deadline.lastValidBlockHeight !== undefined) {
    return blockHeight > deadline.lastValidBlockHeight + DROP_MARGIN_BLOCKS ? { phase: "dropped" } : { phase: "sent" };
  }
  return now - Date.parse(deadline.signedAt) > DROPPED_AFTER_MS ? { phase: "dropped" } : { phase: "sent" };
}

export const LEG_WORDS: Record<LegPhase, string> = {
  signed: "Sending",
  sent: "Confirming",
  landed: "Landed",
  failed: "Failed on chain",
  dropped: "Did not land",
  refused: "Not sent",
};

/** Each sentence follows its leg's word (LEG_WORDS), so it never repeats it. */
export const LEG_PROBLEMS = {
  failed: "Mainnet rejected it after it was sent. The network fee was charged; nothing else moved.",
  dropped: "Its deadline passed before mainnet included it, so it never can. Nothing moved.",
} as const;

const VERBS: Record<ExecutionKind, { doing: string; done: string; partly: string; none: string; leg: string }> = {
  buy: { doing: "Buying", done: "Bought", partly: "Partly bought", none: "Nothing bought", leg: "purchase" },
  sell: { doing: "Selling", done: "Sold", partly: "Partly sold", none: "Nothing sold", leg: "sale" },
};

/** The record's headline: "Buying Prime Seven", "Partly sold AMZNx". */
export function headline(execution: Execution, now: number): string {
  const verbs = VERBS[execution.kind];
  const state = deriveState(execution, now);
  const verb = state === "settled" ? verbs.done : state === "partly-settled" ? verbs.partly : state === "nothing-moved" ? verbs.none : verbs.doing;
  return state === "nothing-moved" ? `${verb}: ${execution.subject}` : `${verb} ${execution.subject}`;
}

/** "3 of 7 landed", or for one leg its own word. */
export function progressLine(execution: Execution): string {
  const landed = execution.legs.filter((leg) => leg.phase === "landed").length;
  if (execution.legs.length === 1) return LEG_WORDS[execution.legs[0].phase];
  return `${landed} of ${execution.legs.length} landed`;
}

/** The one sentence that tells the holder what happened and what follows. */
export function outcomeLine(execution: Execution, now: number): string {
  const state = deriveState(execution, now);
  const leg = VERBS[execution.kind].leg;
  const open = execution.legs.filter((entry) => !isTerminal(entry)).length;
  const landed = execution.legs.filter((entry) => entry.phase === "landed").length;
  const missed = execution.legs.length - landed;
  switch (state) {
    case "settling":
      return `${open} ${open === 1 ? leg : `${leg}s`} waiting for mainnet. Each lands or is called off within about 90 seconds.`;
    case "needs-attention":
      // Seametry's record, not this browser, watches a record it did not keep here.
      if (execution.recordedBy) return `Seametry's record has no answer from mainnet for ${open === 1 ? `one ${leg}` : `${open} ${leg}s`} yet. Read the signature on Solscan meanwhile.`;
      return `Mainnet cannot be read right now, so ${open === 1 ? `one ${leg} is` : `${open} ${leg}s are`} unconfirmed. Seametry keeps checking; read the signature on Solscan meanwhile.`;
    case "settled":
      return execution.legs.length === 1 ? `The ${leg} landed.` : `All ${execution.legs.length} ${leg}s landed.`;
    case "partly-settled":
      return `${landed} landed; ${missed} did not. ${missedAccount(execution)}`;
    case "nothing-moved":
      return `Nothing changed hands. ${missedAccount(execution)}`;
  }
}

/**
 * Why the legs that did not land did not, in one sentence when they share a
 * reason, and what that cost. Only a leg that failed on chain paid anything:
 * one never sent, or never included, cost nothing.
 */
function missedAccount(execution: Execution): string {
  const missed = execution.legs.filter((leg) => leg.phase !== "landed");
  const charged = missed.some((leg) => leg.phase === "failed");
  const cost = charged ? "A rejected transaction still paid its network fee." : "Nothing was charged for them.";
  const reasons = [...new Set(missed.map((leg) => leg.problem?.plain).filter(Boolean))];
  if (reasons.length === 1 && missed.every((leg) => leg.problem)) return `${reasons[0]} ${charged ? cost : ""}`.trim();
  const ways = [...new Set(missed.map((leg) => MISSED_WAYS[leg.phase]))];
  return `${ways.length === 1 ? `${missed.length === 1 ? "It" : "They"} ${ways[0]}` : "Each ended its own way"}; Activity has each reason. ${cost}`;
}

const MISSED_WAYS: Record<LegPhase, string> = {
  signed: "were still sending",
  sent: "were still confirming",
  landed: "landed",
  failed: "were rejected on chain",
  dropped: "never landed before their deadline",
  refused: "were not sent",
};

export type NextAction =
  | { kind: "view-holdings" }
  | { kind: "retry"; legs: Leg[] }
  | { kind: "read-chain"; signature: string }
  | { kind: "none" };

/** What the holder can do now, derived from the record so every surface offers the same thing. */
export function nextAction(execution: Execution, now: number): NextAction {
  const state = deriveState(execution, now);
  if (state === "settling") return { kind: "none" };
  if (state === "needs-attention") {
    const open = execution.legs.find((leg) => !isTerminal(leg));
    return open ? { kind: "read-chain", signature: open.signature } : { kind: "none" };
  }
  if (state === "settled") return { kind: "view-holdings" };
  return { kind: "retry", legs: execution.legs.filter((leg) => leg.phase !== "landed") };
}

/**
 * Whole-percent weights for buying `legs` again, summing to exactly 100 by
 * largest remainder, or undefined when the spends are equal and the plain
 * even split already reproduces them.
 */
export function retryWeights(legs: Leg[]): Record<string, string> | undefined {
  const spends = legs.map((leg) => BigInt(leg.spend.atoms));
  if (spends.every((spend) => spend === spends[0])) return undefined;
  const total = spends.reduce((sum, spend) => sum + spend, 0n);
  const floors = spends.map((spend) => (spend * 100n) / total);
  let left = 100n - floors.reduce((sum, value) => sum + value, 0n);
  const byRemainder = spends.map((spend, index) => ({ index, remainder: (spend * 100n) % total })).sort((a, b) => (b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : a.index - b.index));
  for (const { index } of byRemainder) {
    if (left === 0n) break;
    floors[index] += 1n;
    left -= 1n;
  }
  return Object.fromEntries(legs.map((leg, index) => [leg.mint, floors[index].toString()]));
}

/** The token change a confirmed transaction made to the wallet, per mint, read by the status route. */
export type BalanceChange = { mint: string; atoms: string; scale: number };

/** What the holder received: the bought token on a buy, USDC on a sell. */
export function receivedFrom(kind: ExecutionKind, leg: Pick<Leg, "mint" | "symbol">, changes: BalanceChange[]): Quantity | undefined {
  const mint = kind === "buy" ? leg.mint : USDC_MINT;
  const change = changes.find((entry) => entry.mint === mint);
  if (!change || change.atoms.startsWith("-")) return undefined;
  return { atoms: change.atoms, scale: change.scale, unit: kind === "buy" ? leg.symbol : "USDC" };
}

export type AllocationHolding = {
  id: string;
  name: string;
  templateId?: string;
  createdAt: string;
  legs: { mint: string; symbol: string; atoms: string; scale: number }[];
};

/**
 * Device-local Allocation lots from landed legs: a buy adds what it received,
 * a sale subtracts what it spent. Wallet balances stay the authority; a sale
 * caps these quantities at what the wallet still holds before quoting.
 */
export function allocationHoldings(executions: Execution[], wallet: string): AllocationHolding[] {
  const groups = new Map<string, AllocationHolding & { atoms: Map<string, { symbol: string; atoms: bigint; scale: number }> }>();
  const ordered = executions.filter((entry) => entry.wallet === wallet && entry.allocation).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const execution of ordered) {
    const allocation = execution.allocation!;
    let group = groups.get(allocation.id);
    if (!group) {
      group = { ...allocation, createdAt: execution.createdAt, legs: [], atoms: new Map() };
      groups.set(allocation.id, group);
    }
    for (const leg of execution.legs) {
      if (leg.phase !== "landed") continue;
      const quantity = execution.kind === "buy" ? leg.received : leg.spend;
      if (!quantity || !/^\d+$/.test(quantity.atoms)) continue;
      const held = group.atoms.get(leg.mint);
      const delta = execution.kind === "buy" ? BigInt(quantity.atoms) : -BigInt(quantity.atoms);
      const next = (held?.atoms ?? 0n) + delta;
      group.atoms.set(leg.mint, { symbol: leg.symbol, atoms: next > 0n ? next : 0n, scale: quantity.scale });
    }
  }
  return [...groups.values()]
    .map(({ atoms, ...group }) => ({ ...group, legs: [...atoms].filter(([, entry]) => entry.atoms > 0n).map(([mint, entry]) => ({ mint, symbol: entry.symbol, atoms: entry.atoms.toString(), scale: entry.scale })) }))
    .filter((group) => group.legs.length > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** The trades this browser recorded before the engine existed (lib/allocation/activity.ts, removed). */
export type LegacyTrade = {
  signature: string;
  wallet: string;
  mint: string;
  symbol: string;
  direction: "buy" | "sell";
  inputAtoms: string;
  inputScale: number;
  submittedAt: string;
  allocationId?: string;
  allocationName?: string;
  allocationTemplateId?: string;
  settled?: boolean;
  settledAtoms?: string;
  settledScale?: number;
};

// Legs of one Allocation buy or sell were submitted within seconds of each
// other; two minutes apart is a different decision on the same Allocation.
const SAME_DECISION_MS = 120_000;

/** One record per decision, so history kept before the engine reads the same as new history. */
export function migrateLegacy(trades: LegacyTrade[]): Execution[] {
  const sorted = [...trades].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const executions: Execution[] = [];
  for (const trade of sorted) {
    const leg: Leg = {
      signature: trade.signature,
      mint: trade.mint,
      symbol: trade.symbol,
      spend: { atoms: trade.inputAtoms, scale: trade.inputScale, unit: trade.direction === "buy" ? "USDC" : trade.symbol },
      phase: trade.settled ? "landed" : "sent",
      signedAt: trade.submittedAt,
      ...(trade.direction === "buy" && trade.settledAtoms && trade.settledScale !== undefined ? { received: { atoms: trade.settledAtoms, scale: trade.settledScale, unit: trade.symbol } } : {}),
    };
    const previous = executions[executions.length - 1];
    const joins = previous && trade.allocationId && previous.allocation?.id === trade.allocationId && previous.kind === trade.direction &&
      previous.wallet === trade.wallet && Date.parse(trade.submittedAt) - Date.parse(previous.createdAt) <= SAME_DECISION_MS;
    if (joins) {
      previous.legs.push(leg);
      continue;
    }
    executions.push({
      id: trade.signature,
      kind: trade.direction,
      wallet: trade.wallet,
      network: "mainnet",
      subject: trade.allocationName ?? trade.symbol,
      ...(trade.allocationId ? { allocation: { id: trade.allocationId, name: trade.allocationName ?? "Allocation", ...(trade.allocationTemplateId ? { templateId: trade.allocationTemplateId } : {}) } } : {}),
      legs: [leg],
      createdAt: trade.submittedAt,
      seen: true,
    });
  }
  return executions.reverse();
}
