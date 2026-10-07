import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { blockingFact, admissions, gradeOf, partitionAdmissions } from "@/lib/allocation/admissions";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { SLIPPAGE_BPS, countryGate, feeSchedule } from "@/lib/allocation/rules";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { PageHeader } from "../_shell/page-header";
import { AllocationFlow, type OfferedLot, type RefusedLot } from "./flow";
import styles from "./allocation.module.css";

export const metadata: Metadata = {
  title: "Build a basket | Seametry",
  description: "Plan and buy several admitted tokenized stocks directly into your own wallet, with every purchase shown before you sign.",
};

function multiplierLine(lot: (typeof admissions.instruments)[number]) {
  const multiplier = lot.instrument.multiplier;
  if (!multiplier) return "No Scaled UI multiplier on this mint.";
  const effective = new Date(multiplier.effective_at).toUTCString().slice(5, 16);
  return `Wallets that apply the Scaled UI multiplier show what you receive multiplied by ${formatAmount(multiplier.value.atoms, multiplier.value.scale)}, effective ${effective}, as resolved at the snapshot instant.`;
}

export default async function AllocationPage() {
  await connection();
  const requestHeaders = await headers();
  const configured = allocationConfig();
  const unavailable =
    "missing" in configured
      ? "Purchases are unavailable in this deployment. You can still build and inspect a plan."
      : (() => {
          const gate = countryGate(requestCountry(requestHeaders), configured.config.blockedCountries);
          return gate.open ? undefined : gate.reason;
        })();

  const { admitted, refused } = partitionAdmissions(admissions.instruments);
  const offered: OfferedLot[] = admitted.map((lot) => {
    const prerogatives = lot.instrument.prerogatives.map((p) => p.sentence);
    // The issuer-power reasons repeat the condition report word for word, so
    // the stamp cites only what the report does not already state.
    const beyondPowers = lot.capacity_decision.reasons
      .filter((reason) => reason.severity !== "ALLOW" && !prerogatives.includes(reason.fact))
      .map((reason) => reason.fact);
    return {
      mint: lot.instrument.mint,
      symbol: lot.instrument.symbol ?? lot.instrument.mint,
      issuer: lot.issuer,
      grade: gradeOf(lot),
      decision: lot.capacity_decision.decision,
      capacityUsdc: lot.capacity_usdc,
      stampReason: beyondPowers[0] ?? `Admitted through ${formatAmount(BigInt(lot.capacity_usdc), 0)} USDC on the captured depth curve.`,
      prerogatives,
      multiplier: multiplierLine(lot),
      slot: lot.instrument.capture.slot,
    };
  });
  const refusedLots: RefusedLot[] = refused.map((lot) => ({
    symbol: lot.instrument.symbol ?? lot.instrument.mint,
    fact: blockingFact(lot),
  }));

  return (
    <div className={styles.page}>
        <PageHeader
          group="Allocation"
          title="Build a basket"
          network="Mainnet"
          info={
            <>
              <p>One swap per constituent, each settling to your wallet. Nothing is pooled and no basket token is issued.</p>
              <p>
                Seametry&apos;s routing fee falls as the basket grows: {feeSchedule()}. Slippage tolerance is {formatAmount(BigInt(SLIPPAGE_BPS), 2)}%. Both are
                lines on the order sheet, and every swap is freshly quoted and simulated before you sign.
              </p>
              <p>You remain bound by each issuer&apos;s terms of eligibility.</p>
            </>
          }
        />
        <AllocationFlow
          offered={offered}
          refused={refusedLots}
          snapshot={{
            asOf: admissions.as_of,
            age: relativeEvidenceAge(admissions.as_of),
            policyVersion: admissions.policy_version,
            referenceUsdc: admissions.reference_usdc,
          }}
          unavailable={unavailable}
        />
    </div>
  );
}
