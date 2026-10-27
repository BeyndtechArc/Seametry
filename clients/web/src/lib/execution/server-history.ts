// Seametry's record of a signed-in account's linked wallets
// (GET /v1/me/activity, through /api/history), turned into the same records
// this browser keeps and merged with them. Pure, so the merge is tested
// without a network: tests/server-history.spec.ts.
//
// Trust follows the record's sources (.plan/activity-record-and-admin.plan.md):
// a server leg says what Seametry sent; only a leg the chain answered for
// says what settled, and only that leg can count toward an Allocation.

import type { components } from "@seametry/api-types";
import type { Execution, Leg, LegPhase } from "./record";

export type WalletExecution = components["schemas"]["WalletExecution"];
export type WalletLeg = components["schemas"]["WalletLeg"];

/** What /api/history answers. */
export type HistoryAnswer =
  | { state: "signed-out" }
  | { state: "recorded"; wallets: string[]; executions: WalletExecution[]; readAt: string }
  | { state: "unavailable"; detail: string };

const USDC_SCALE = 6;

function phaseOf(leg: WalletLeg): LegPhase {
  if (leg.chain) return leg.chain.outcome;
  return leg.submit_result === "refused_not_sent" ? "refused" : "sent";
}

function magnitude(atoms: string | undefined): string | undefined {
  if (!atoms || !/^-?\d+$/.test(atoms)) return undefined;
  const value = BigInt(atoms);
  return value > 0n ? value.toString() : value < 0n ? (-value).toString() : undefined;
}

function legOf(kind: "buy" | "sell", leg: WalletLeg): Leg {
  const symbol = leg.symbol ?? `${leg.mint.slice(0, 4)}…`;
  const chain = leg.chain;
  const spentUnit = kind === "buy" ? "USDC" : symbol;
  // A leg found only on chain carries no quoted spend; what left the wallet is its spend.
  const spentOnChain = kind === "buy" ? magnitude(chain?.wallet_usdc_delta) : magnitude(chain?.wallet_token_delta);
  const spend = leg.spend
    ? { atoms: leg.spend.atoms, scale: leg.spend.scale, unit: spentUnit }
    : { atoms: spentOnChain ?? "0", scale: kind === "buy" ? USDC_SCALE : chain?.token_scale ?? 0, unit: spentUnit };
  const receivedAtoms = chain?.outcome === "landed" ? (kind === "buy" ? magnitude(chain.wallet_token_delta) : magnitude(chain.wallet_usdc_delta)) : undefined;
  const receivedScale = kind === "buy" ? chain?.token_scale : USDC_SCALE;
  return {
    signature: leg.signature,
    mint: leg.mint,
    symbol,
    spend,
    phase: phaseOf(leg),
    signedAt: leg.submitted_at,
    ...(chain ? { endedAt: chain.block_time ?? chain.reconciled_at, chainConfirmed: true } : {}),
    ...(receivedAtoms && receivedScale !== undefined ? { received: { atoms: receivedAtoms, scale: receivedScale, unit: kind === "buy" ? symbol : "USDC" } } : {}),
  };
}

/**
 * One record per recorded quote. A quote of more than one stock, or of a
 * published basket, is attributed to an Allocation named by its subject; a
 * single-stock purchase is not, as on this device.
 */
export function fromServer(executions: WalletExecution[]): Execution[] {
  return executions.map((recorded) => {
    const legs = recorded.legs.map((leg) => legOf(recorded.kind, leg));
    const open = recorded.legs.filter((leg) => !leg.chain && leg.submit_result !== "refused_not_sent");
    const subject = recorded.subject ?? (legs.length === 1 ? legs[0].symbol : "Allocation");
    const attributed = recorded.kind === "buy" && (recorded.plan_size > 1 || recorded.template_id);
    return {
      id: recorded.quote_id,
      kind: recorded.kind,
      wallet: recorded.wallet,
      network: "mainnet",
      subject,
      ...(attributed ? { allocation: { id: recorded.quote_id, name: subject, ...(recorded.template_id ? { templateId: recorded.template_id } : {}) } } : {}),
      legs,
      createdAt: recorded.prepared_at,
      seen: true,
      recordedBy: recorded.source,
      // A sent leg Seametry has no chain answer for is not settling in this
      // browser, which watches only its own records: it reads as unconfirmed.
      ...(open.length > 0 ? { unreadable: { since: open[0].submitted_at, detail: "Seametry's record has no answer from mainnet for this yet." } } : {}),
    };
  });
}

/**
 * This browser's records with Seametry's, newest first. A server record
 * any of whose signatures this browser already holds is the same trade, and
 * the browser's own record, which it watches, is kept.
 */
export function mergeHistory(local: Execution[], server: Execution[]): Execution[] {
  const held = new Set(local.flatMap((execution) => execution.legs.map((leg) => leg.signature)));
  const ids = new Set(local.map((execution) => execution.id));
  const added = server.filter((execution) => !ids.has(execution.id) && !execution.legs.some((leg) => held.has(leg.signature)));
  return [...local, ...added].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
