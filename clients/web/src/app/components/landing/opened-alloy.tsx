import { Grade, LotMark, Stamp } from "@seametry/ui";
import { admissions, findAdmission } from "@/lib/allocation/admissions";
import { allocationOffer } from "@/lib/allocation/offer";
import { photos } from "@/lib/photos";
import { OrbitDrawing } from "./drawings";
import { evidenceDate, founded } from "./founding";
import styles from "./landing.module.css";

// The issuer powers a chip can name in a word or two, keyed by the policy
// engine's reason code. A power whose code is not here shows its code, so a
// power this page has not been taught still appears, under its own name.
const powerNames: Record<string, string> = {
  ISSUER_CAN_FREEZE: "Freeze",
  ISSUER_CAN_PAUSE: "Pause",
  ISSUER_CAN_SEIZE: "Seizure",
  TRANSFER_HOOK_CAN_BE_ENABLED: "Recipient gate",
  ISSUER_CAN_CHANGE_APPARENT_QUANTITY: "Multiplier",
  ISSUER_CAN_MINT_MORE: "New supply",
};

const stampKinds = { ALLOW: "allow", WARN: "warn", BLOCK: "block" } as const;

/**
 * components.md, Opened Alloy: one founded Alloy drawn as its share at the
 * centre of an orbit of its constituents, each with its units per share,
 * and its first leg opened beside it into the powers its issuer keeps.
 */
export function OpenedAlloy() {
  const alloy = founded();
  const offer = allocationOffer();
  const opened = alloy?.legs[0];
  const lot = opened && offer.offered.find((candidate) => candidate.mint === opened.realMint);
  const admission = opened && findAdmission(opened.realMint);
  if (!alloy || !opened || !lot || !admission) return null;

  const powers = admission.capacity_decision.reasons.filter((reason) => lot.prerogatives.includes(reason.fact));
  const decision = lot.decision in stampKinds ? stampKinds[lot.decision as keyof typeof stampKinds] : undefined;

  return (
    <figure className={styles.opened}>
      <div className={styles.openedStage}>
        <OrbitDrawing legs={alloy.legs} symbol={alloy.symbol} artwork={alloy.artwork} />

        <div className={styles.openedLeg}>
          <span className={`${styles.photoGround} ${styles.openedPhoto}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses, and its transformations count against the hosting plan; the file is already sized. */}
            <img src={photos.warehouseAisle.src} width={photos.warehouseAisle.width} height={photos.warehouseAisle.height} alt={photos.warehouseAisle.alt} loading="lazy" decoding="async" />
          </span>
          <article className={styles.openedCard} aria-label={`${lot.symbol}, opened`}>
            <header>
              <LotMark symbol={lot.symbol} src={lot.logo} size="list" />
              <div>
                <b>{lot.symbol}</b>
                <span>{lot.name ?? lot.issuer}</span>
              </div>
              <Grade name={lot.grade} />
            </header>
            <span className={styles.openedLabel}>Powers its issuer keeps</span>
            <ul className={styles.powers}>
              {powers.map((power) => <li key={power.code} title={power.fact}>{powerNames[power.code] ?? power.code}</li>)}
            </ul>
            {decision ? <Stamp kind={decision} reason={`Under ${offer.policyVersion}`} /> : <span>Decision {lot.decision} under {offer.policyVersion}</span>}
          </article>
        </div>
      </div>
      <figcaption className={styles.openedCaption}>
        {alloy.name}, from its founding record on Solana {alloy.cluster}, {alloy.foundedOn}, slot {alloy.slot}; each leg is a devnet stand-in for the token named.
        {" "}{lot.symbol} as {offer.policyVersion} read its mint, snapshot of {evidenceDate.format(new Date(admissions.as_of))}.
        {" "}Photo: <a href={photos.warehouseAisle.source} rel="noreferrer">{photos.warehouseAisle.photographer}, Unsplash</a>, illustrative.
      </figcaption>
    </figure>
  );
}
