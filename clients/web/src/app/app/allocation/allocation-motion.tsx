"use client";

import styles from "./allocation.module.css";

export type AllocationMotionState = "idle" | "preflight" | "approval" | "settling" | "partial" | "success" | "failure";

export type SettlementLeg = {
  symbol: string;
  phase: "idle" | "preparing" | "signing" | "sending" | "settled" | "failed";
};

const captions: Record<AllocationMotionState, string> = {
  idle: "Awaiting your decision",
  preflight: "Checking the quoted routes for every constituent.",
  approval: "Prepared routes are waiting for wallet signatures.",
  settling: "Signed swaps are being submitted and confirmed independently.",
  partial: "Some constituents settled. Others did not, and remain visible below.",
  success: "Every recorded constituent purchase settled.",
  failure: "Purchases were stopped or refused. Check the individual leg records.",
};

const names: Record<AllocationMotionState, string> = {
  idle: "Ready",
  preflight: "Checking routes",
  approval: "Awaiting signature",
  settling: "Settling constituent legs",
  partial: "Partial settlement",
  success: "Allocation assembled",
  failure: "Purchase stopped",
};

const phaseNames: Record<SettlementLeg["phase"], string> = {
  idle: "Waiting",
  preparing: "Checking",
  signing: "Approval",
  sending: "Confirming",
  settled: "Settled",
  failed: "Stopped",
};

/**
 * The transaction register visualizes ACTUAL constituents and their reported
 * phases. No decorative orbit, invented nodes or automatic loading page.
 * The moving rule is only shown while real wallet/network work is ongoing.
 */
export function AllocationMotion({
  state,
  total,
  settled,
  legs,
}: {
  state: AllocationMotionState;
  total: number;
  settled: number;
  legs: SettlementLeg[];
}) {
  return (
    <figure className={styles.settlementDiagram} data-state={state} aria-label="Constituent settlement overview">
      <div className={styles.settlementDiagramHead} aria-live="polite">
        <strong>{names[state]}</strong>
        <span>{settled} / {total} settled</span>
      </div>
      <ol className={styles.settlementTrack} aria-label="Individual purchase legs">
        {legs.map((leg, index) => {
          const displayedPhase = state === "preflight" && leg.phase === "idle" ? "preparing"
            : state === "approval" && leg.phase === "idle" ? "signing"
            : leg.phase;
          return (
            <li key={leg.symbol + "-" + index} data-phase={displayedPhase}>
              <span className={styles.settlementLine} aria-hidden="true"><i /></span>
              <b>{leg.symbol}</b>
              <small>{phaseNames[displayedPhase]}</small>
            </li>
          );
        })}
      </ol>
      <figcaption>{captions[state]}</figcaption>
    </figure>
  );
}
