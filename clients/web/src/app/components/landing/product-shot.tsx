import { Digest, Grade, LotMark, Stamp } from "@seametry/ui";
import { allocationOffer } from "@/lib/allocation/offer";
import { photos } from "@/lib/photos";
import { evidenceDate, founded } from "./founding";
import { PhotoFrame } from "./photo-frame";
import styles from "./landing.module.css";

const stampKinds = { ALLOW: "allow", WARN: "warn", BLOCK: "block" } as const;

/**
 * components.md, Product shot: one founded Alloy at the back, cut by the
 * section's edges, with its first leg's condition, that leg's business and
 * the founding transaction layered over it.
 */
export function ProductShot() {
  const alloy = founded();
  const offer = allocationOffer();
  const leg = alloy?.legs[0];
  const lot = leg && offer.offered.find((candidate) => candidate.mint === leg.realMint);
  if (!alloy || !leg || !lot) return null;
  const decision = lot.decision in stampKinds ? stampKinds[lot.decision as keyof typeof stampKinds] : undefined;

  return (
    <div className={styles.shot}>
      <article className={styles.shotRecord} aria-label={`${alloy.name}, from its founding record`}>
        <div className={styles.shotBar}>
          <span>Alloys</span>
          <span aria-hidden="true">/</span>
          <b>{alloy.name}</b>
          <span className={styles.shotNetwork}>Devnet</span>
        </div>
        <div className={styles.shotIdentity}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses. */}
          <img src={alloy.artwork} width={88} height={88} alt="" />
          <div>
            <span>Alloy {alloy.id}</span>
            <h3>{alloy.name}</h3>
            <span>{alloy.symbol}</span>
          </div>
        </div>
        <p className={styles.shotLead}>One share holds {alloy.legs.length} stocks in fixed amounts.</p>
        <table className={styles.legTable}>
          <thead>
            <tr>
              <th scope="col">Constituent</th>
              <th scope="col">Units per share</th>
              <th scope="col">Issuer</th>
            </tr>
          </thead>
          <tbody>
            {alloy.legs.map((row) => (
              <tr key={row.symbol}>
                <th scope="row">
                  <LotMark symbol={row.symbol} src={row.logo} />
                  <span>{row.symbol}</span>
                </th>
                <td>{row.units}</td>
                <td>{row.issuer}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.shotSource}>
          Founding record, Solana {alloy.cluster}, founded {alloy.foundedOn} at slot {alloy.slot}. Each leg is a devnet stand-in for the token named.
        </p>
      </article>

      <div className={styles.shotFounding}>
        <span>Founded on {alloy.cluster}</span>
        <Digest value={alloy.signature} />
      </div>

      <article className={styles.shotCondition} aria-label={`${lot.symbol}, condition`}>
        <header>
          <LotMark symbol={lot.symbol} src={lot.logo} size="list" />
          <div>
            <b>{lot.symbol}</b>
            <span>{lot.name ? `${lot.name}, ` : ""}{lot.issuer}</span>
          </div>
          <Grade name={lot.grade} />
        </header>
        <span className={styles.shotLabel}>What the issuer can still do, read from the mint</span>
        <ul>
          {lot.prerogatives.map((sentence) => <li key={sentence}>{sentence}</li>)}
        </ul>
        <footer>
          {decision ? <Stamp kind={decision} reason={lot.stampReason} /> : <span>Decision {lot.decision}, not one this page names.</span>}
          <span>
            {offer.policyVersion}, captured at slot {BigInt(lot.slot).toLocaleString("en-US")}, snapshot of {evidenceDate.format(new Date(offer.asOf))}
          </span>
        </footer>
      </article>

      <PhotoFrame
        className={styles.shotPhoto}
        photo={photos.warehouseAisle}
        caption={`Under ${lot.symbol}: ${lot.name ?? "its issuer's stock"}. Illustrative.`}
      />
    </div>
  );
}
