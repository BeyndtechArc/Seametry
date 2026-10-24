import { QuietLink } from "@seametry/ui";
import { StepDrawing, type StepKind } from "./drawings";
import { founded } from "./founding";
import styles from "./landing.module.css";

const steps: { kind: StepKind; title: string; line: string }[] = [
  { kind: "strike", title: "Strike", line: "Deposit what one share holds. Receive the share." },
  { kind: "melt", title: "Melt", line: "Return the share. Each stock comes back on its own." },
  { kind: "frozen", title: "A frozen leg", line: "A frozen stock stays yours as a Claim. The rest arrive." },
];

/** components.md, Strike steps: the same founded Alloy as the opened Alloy above, drawn moving. */
export function StrikeSteps() {
  const alloy = founded();
  if (!alloy) return null;

  return (
    <>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.kind}>
            <StepDrawing kind={step.kind} legs={alloy.legs} symbol={alloy.symbol} artwork={alloy.artwork} />
            <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{step.title}</h3>
            <p>{step.line}</p>
          </li>
        ))}
      </ol>
      <p className={styles.stepsNote}>
        <span>A bundle buys several tokens and stops there: no share exists. An Alloy share exists because a Formula entered the Hall, and any wallet can Strike or Melt it. Which leg is held is illustrative; the recorded freeze is the ledger above.</span>
        <QuietLink href="/docs/how-it-works#why-is-a-bundle-of-tokens-not-an-etf" icon="arrow-up-right">Why a bundle is not an ETF</QuietLink>
      </p>
    </>
  );
}
