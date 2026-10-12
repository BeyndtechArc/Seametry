"use client";

import { useState } from "react";
import styles from "./artifacts.module.css";

// An illustrative holder moving between two Hall versions. The steps are the
// Hall's (HALL.md section 6: a new version is a new deployment, and holders
// leave by Melting from one and Striking into another); the quantities are an
// example, labelled so in the caption.
const steps = [
  {
    title: "You hold shares on Hall version 1",
    detail: "Once made final, version 1 keeps its code for good. Nothing about your shares changes because a version 2 exists.",
    wallet: ["10 Alloy shares, Hall version 1"],
  },
  {
    title: "Melt them on version 1",
    detail: "The shares are burned and version 1 records what you are owed of every constituent. No constituent moves, so no issuer can stop this step.",
    wallet: ["Claim on version 1: 20 AAPLx, 15 NVDAx, 2.5 TSLAx"],
  },
  {
    title: "Withdraw each leg",
    detail: "Each constituent is delivered on its own. A leg an issuer is holding back stays yours as a Claim on version 1 until it can be withdrawn.",
    wallet: ["20 AAPLx", "15 NVDAx", "2.5 TSLAx"],
  },
  {
    title: "Strike on version 2",
    detail: "If you choose to, deposit the constituents into the version 2 Alloy and receive its shares. Nobody can move you; you move yourself, when you want to.",
    wallet: ["Version 2 Alloy shares, at version 2's Formula"],
  },
];

/** Leaving one Hall version for another, one step at a time. */
export function VersionSteps() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  return (
    <figure className={styles.artifact} aria-label="Leaving one Hall version for another">
      <ol className={styles.stepper} aria-label="Steps">
        {steps.map((item, index) => (
          <li key={item.title} aria-current={index === step ? "step" : undefined} data-done={index < step || undefined}>
            <span>{index + 1}</span>
            <b>{item.title}</b>
          </li>
        ))}
      </ol>
      <p className={styles.verdict} role="status">{current.detail}</p>
      <div className={styles.walletBox}>
        <span>Your wallet after step {step + 1}</span>
        <ul>{current.wallet.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
      <div className={styles.actions}>
        {step < steps.length - 1 ? <button type="button" onClick={() => setStep(step + 1)}>Next: {steps[step + 1].title.toLowerCase()}</button> : <button type="button" onClick={() => setStep(0)}>Start again</button>}
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)}>Back</button> : null}
      </div>
      <figcaption>Illustrative holder and quantities. The steps are the Hall&apos;s: a new version is a new deployment, and holders leave by Melting from one version and Striking into another (<code>docs/prd/HALL.md</code>, section 6).</figcaption>
    </figure>
  );
}
