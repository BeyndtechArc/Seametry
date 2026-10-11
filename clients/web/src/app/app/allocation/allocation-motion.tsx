"use client";

import type { CSSProperties } from "react";
import styles from "./allocation.module.css";

export type AllocationMotionState = "idle" | "preflight" | "approval" | "settling" | "partial" | "success" | "failure";

const labels: Record<AllocationMotionState, string> = {
  idle: "Ready to assemble",
  preflight: "Assaying every route",
  approval: "Waiting for one allocation decision",
  settling: "Settling constituent legs",
  partial: "Partially settled",
  success: "Allocation assembled",
  failure: "Nothing unsafe was sent",
};

export function AllocationMotion({
  state,
  total,
  settled,
}: {
  state: AllocationMotionState;
  total: number;
  settled: number;
}) {
  const count = Math.max(3, Math.min(total || 6, 8));
  const nodes = Array.from({ length: count });
  return (
    <figure className={styles.allocationMotion} data-state={state} aria-live="polite">
      <div className={styles.motionStage} aria-hidden="true">
        <div className={styles.motionCore}><i /><b>{settled}/{total || count}</b></div>
        {nodes.map((_, index) => {
          const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 39;
          const y = 50 + Math.sin(angle) * 35;
          const isSettled = index < settled;
          const style = {
            left: x + "%",
            top: y + "%",
            "--sm-motion-i": index,
          } as CSSProperties;
          return (
            <span key={index} className={styles.motionNode} data-settled={isSettled || undefined} style={style}>
              <i />
            </span>
          );
        })}
        <span className={styles.motionOrbit} />
        <span className={styles.motionOrbitInner} />
      </div>
      <figcaption>
        <strong>{labels[state]}</strong>
        <span>
          {state === "partial"
            ? "Settled legs stay in the wallet; blocked or refused legs remain explicit."
            : state === "failure"
              ? "The plan stopped at its safety boundary. Review the failed leg before trying again."
              : "One allocation decision, with each constituent still independently observable."}
        </span>
      </figcaption>
    </figure>
  );
}
