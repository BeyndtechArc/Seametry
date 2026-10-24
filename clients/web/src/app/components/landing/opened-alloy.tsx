import { admissions, findAdmission } from "@/lib/allocation/admissions";
import { allocationOffer } from "@/lib/allocation/offer";
import { photos, type Photo } from "@/lib/photos";
import { evidenceDate, founded } from "../drawn/founding";
import { OpenedOrbit, type OpenedLeg } from "./opened-orbit";
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

// A photograph of the kind of business under each leg, illustrative only.
// There are five photographs for six legs, so two cloud businesses share
// the server cabinets.
const photoOf: Record<string, Photo> = {
  AMZNx: photos.warehouseAisle,
  GOOGLx: photos.serverCabinets,
  METAx: photos.glassTowers,
  AAPLx: photos.robotArm,
  NVDAx: photos.siliconWafer,
  MSFTx: photos.serverCabinets,
};

const stampKinds = { ALLOW: "allow", WARN: "warn", BLOCK: "block" } as const;

/**
 * components.md, Opened Alloy: one founded Alloy drawn as its share at the
 * centre of an orbit of its constituents, each with its units per share,
 * turning one leg at a time to the card that opens it.
 */
export function OpenedAlloy() {
  const alloy = founded();
  if (!alloy) return null;
  const offer = allocationOffer();

  const legs: OpenedLeg[] = [];
  for (const leg of alloy.legs) {
    const lot = offer.offered.find((candidate) => candidate.mint === leg.realMint);
    const admission = findAdmission(leg.realMint);
    // A leg the Allocation does not offer has no card to open; drawing the
    // orbit without it would misstate the Formula, so the figure is left out.
    if (!lot || !admission) return null;
    legs.push({
      symbol: leg.symbol,
      units: leg.units,
      logo: leg.logo,
      name: lot.name,
      issuer: lot.issuer,
      grade: lot.grade,
      powers: admission.capacity_decision.reasons
        .filter((reason) => lot.prerogatives.includes(reason.fact))
        .map((reason) => ({ code: reason.code, label: powerNames[reason.code] ?? reason.code, fact: reason.fact })),
      stamp: lot.decision in stampKinds ? stampKinds[lot.decision as keyof typeof stampKinds] : undefined,
      decision: lot.decision,
      photo: photoOf[leg.symbol],
    });
  }

  // The figure shows no caption (Storm, 24 October 2026); its sources travel
  // as the drawing's description, where assistive technology reads them.
  const provenance = `${alloy.name}, from its founding record on Solana ${alloy.cluster}, ${alloy.foundedOn}, slot ${alloy.slot}; each leg is a devnet stand-in for the token named. Each leg as ${offer.policyVersion} read its mint, snapshot of ${evidenceDate.format(new Date(admissions.as_of))}. Photographs are illustrative.`;

  return (
    <figure className={styles.opened}>
      <OpenedOrbit legs={legs} symbol={alloy.symbol} artwork={alloy.artwork} policyVersion={offer.policyVersion} provenance={provenance} />
    </figure>
  );
}
