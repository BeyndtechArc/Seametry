import { LotMark, QuietLink } from "@seametry/ui";
import { founded, type FoundedLeg } from "./founding";
import styles from "./landing.module.css";

// The same founded Alloy as the product shot above, so the steps read as
// that Alloy moving. Which leg the third step holds is illustrative: the
// recorded freeze in the incident ledger was on a mock issuer's token, not
// on any of these.
const SHOWN = 3;

function Legs({ legs, state, held }: { legs: FoundedLeg[]; state: string; held?: number }) {
  return (
    <ul className={styles.stepLegs}>
      {legs.slice(0, SHOWN).map((leg, index) => (
        <li key={leg.symbol} data-held={index === held ? "" : undefined}>
          <LotMark symbol={leg.symbol} src={leg.logo} />
          <span>{leg.symbol}</span>
          <b>{leg.units}</b>
          <small>{index === held ? "Held as a Claim" : state}</small>
        </li>
      ))}
      {legs.length > SHOWN ? <li className={styles.stepMore}>and {legs.length - SHOWN} more legs</li> : null}
    </ul>
  );
}

/** components.md, Strike steps. */
export function StrikeSteps() {
  const alloy = founded();
  if (!alloy) return null;

  return (
    <>
      <ol className={styles.steps}>
        <li>
          <span className={styles.stepIndex}>01</span>
          <h3>Strike</h3>
          <p>A wallet holding the Formula&apos;s stocks deposits them in the Hall and receives shares. You choose a number of shares; the Hall works out each stock.</p>
          <div className={styles.stepFragment}>
            <Legs legs={alloy.legs} state="Deposited" />
            <p className={styles.stepResult}><span>Receives</span><b>1 {alloy.symbol} share</b></p>
          </div>
        </li>
        <li>
          <span className={styles.stepIndex}>02</span>
          <h3>Melt</h3>
          <p>Melt burns the shares and writes down what is owed of every stock, touching none of them. Each stock is then withdrawn on its own.</p>
          <div className={styles.stepFragment}>
            <p className={styles.stepResult}><span>Returns</span><b>1 {alloy.symbol} share</b></p>
            <Legs legs={alloy.legs} state="Withdrawn" />
          </div>
        </li>
        <li>
          <span className={styles.stepIndex}>03</span>
          <h3>A frozen leg</h3>
          <p>If an issuer has frozen one stock, it stays yours as a named Claim, and the others arrive. The Claim can be withdrawn when delivery resumes.</p>
          <div className={styles.stepFragment}>
            <p className={styles.stepResult}><span>Returns</span><b>1 {alloy.symbol} share</b></p>
            <Legs legs={alloy.legs} state="Withdrawn" held={1} />
            <p className={styles.stepCaption}>Which leg is held is illustrative. The recorded freeze is the ledger above.</p>
          </div>
        </li>
      </ol>
      <p className={styles.stepsNote}>
        <span>A bundle buys several tokens and stops there: no share exists. An Alloy share exists because a Formula entered the Hall, and any wallet can Strike or Melt it.</span>
        <QuietLink href="/docs/how-it-works#why-is-a-bundle-of-tokens-not-an-etf" icon="arrow-up-right">Why a bundle is not an ETF</QuietLink>
      </p>
    </>
  );
}
