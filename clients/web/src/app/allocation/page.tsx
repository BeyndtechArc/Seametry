import type { Metadata } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { blockingFact, admissions, partitionAdmissions } from "@/lib/allocation/admissions";
import { allocationConfig, requestCountry } from "@/lib/allocation/config";
import { SLIPPAGE_BPS, countryGate } from "@/lib/allocation/rules";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { PublicShell } from "../public-shell";
import { AllocationFlow, type OfferedLot, type RefusedLot } from "./flow";
import styles from "./allocation.module.css";

export const metadata: Metadata = {
  title: "Allocation | Seametry",
  description: "Buy admitted tokenized stocks into your own wallet, one swap per lot, with every term shown before you sign.",
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
      ? `This deployment is not configured for Allocations: ${configured.missing.join(", ")} not set.`
      : (() => {
          const gate = countryGate(requestCountry(requestHeaders), configured.config.blockedCountries);
          return gate.open ? undefined : gate.reason;
        })();

  const { admitted, refused } = partitionAdmissions(admissions.instruments);
  const offered: OfferedLot[] = admitted.map((lot) => {
    const prerogatives = lot.instrument.prerogatives.map((p) => p.sentence);
    // The issuer-power reasons repeat the condition report word for word, so
    // the stamp cites only what the report does not already state.
    const beyondPowers = lot.decision.reasons
      .filter((reason) => reason.severity !== "ALLOW" && !prerogatives.includes(reason.fact))
      .map((reason) => reason.fact);
    return {
      mint: lot.instrument.mint,
      symbol: lot.instrument.symbol ?? lot.instrument.mint,
      issuer: lot.issuer,
      decision: lot.decision.decision,
      stampReason: beyondPowers[0] ?? "Admitted. The issuer's powers over it are stated below.",
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
    <PublicShell current="allocation">
      <div className={styles.page}>
        <header className={styles.intro}>
          <span className={styles.worldName}>Allocation</span>
          <h1>Buy into your own wallet</h1>
          <p>
            Each admitted lot is bought with USDC in its own swap, straight into the wallet you connect. Nothing is pooled
            and Seametry holds nothing. You sign every leg yourself after seeing what it will do.
          </p>
          <p className={styles.terms}>
            Mainnet. No Seametry fee. Slippage {SLIPPAGE_BPS} basis points. At most {formatAmount(BigInt(admissions.reference_usdc), 0)} USDC
            per lot, the size its depth was measured to. You remain bound by each issuer&apos;s own terms of eligibility.
          </p>
        </header>
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
    </PublicShell>
  );
}
