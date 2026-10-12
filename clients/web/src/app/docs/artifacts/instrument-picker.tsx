"use client";

import { useState } from "react";
import { Grade, Stamp, type GradeName } from "@seametry/ui";
import styles from "./artifacts.module.css";

export type ExplorerInstrument = {
  symbol: string;
  issuer: string;
  mint: string;
  grade: GradeName;
  powers: string[];
  decision: string;
  reasons: { severity: string; fact: string }[];
  capacity: number;
  slot: string;
  capturedAt?: string;
};

const stampKind = (decision: string) => (decision === "BLOCK" ? "block" : decision === "WARN" ? "warn" : "allow");

/** One instrument's assay record, as the policy engine wrote it. */
export function InstrumentPicker({ instruments, provenance, initial }: { instruments: ExplorerInstrument[]; provenance: string; initial: string }) {
  const [symbol, setSymbol] = useState(initial);
  const chosen = instruments.find((instrument) => instrument.symbol === symbol) ?? instruments[0];
  const blocking = chosen.reasons.find((reason) => reason.severity === "BLOCK");
  const record = [
    `${chosen.symbol}  ${chosen.issuer}`,
    `mint      ${chosen.mint}`,
    `captured  slot ${Number(chosen.slot).toLocaleString("en-GB")}, ${chosen.capturedAt ? new Date(chosen.capturedAt).toUTCString() : "capture time not recorded"}`,
    `grade     ${chosen.grade}`,
    "",
    chosen.powers.length ? "the issuer can:" : "the issuer holds none of the powers the decoder reads",
    ...chosen.powers.map((power) => `  ${power.replace(/^The issuer can /, "").replace(/\.$/, "")}`),
    "",
    `decision  ${chosen.decision}`,
    `capacity  ${chosen.capacity.toLocaleString("en-GB")} USDC${chosen.capacity === 0 ? " (not offered)" : ""}`,
  ].join("\n");

  return (
    <figure className={styles.artifact} aria-label="Read any captured instrument">
      <div className={styles.controls}>
        <label className={styles.select}>
          <span>Instrument</span>
          <select value={chosen.symbol} onChange={(event) => setSymbol(event.target.value)}>
            {instruments.map((instrument) => (
              <option key={instrument.mint} value={instrument.symbol}>{instrument.symbol}, {instrument.issuer}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.marks}>
        <Grade name={chosen.grade} />
        <Stamp kind={stampKind(chosen.decision)} reason={blocking?.fact ?? (chosen.decision === "WARN" ? "Admitted, with the issuer's powers stated." : "Admitted.")} />
      </div>
      <pre className={styles.working} aria-label={`${chosen.symbol} assay record`}>
        <code>{record}</code>
      </pre>
      <figcaption>{provenance}</figcaption>
    </figure>
  );
}
