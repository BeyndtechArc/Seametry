import type { Metadata } from "next";
import { connection } from "next/server";
import { admissions, blockingFact, gradeOf, isAdmitted } from "@/lib/allocation/admissions";
import { quoteKey } from "@/lib/compose/quote-config";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { PageHeader } from "../_shell/page-header";
import { Composer, type Candidate } from "./composer";

export const metadata: Metadata = {
  title: "Compose a Formula | Seametry",
  description: "Draft an Alloy's Formula from assayed instruments, priced by live mainnet quotes. Nothing is founded here.",
};

export default async function ComposePage() {
  await connection();
  const key = quoteKey();
  const candidates: Candidate[] = admissions.instruments.map((admission) => ({
    mint: admission.instrument.mint,
    symbol: admission.instrument.symbol ?? admission.instrument.mint,
    issuer: admission.issuer,
    grade: gradeOf(admission),
    decimals: admission.decimals,
    decision: admission.capacity_decision.decision,
    admitted: isAdmitted(admission),
    fact: isAdmitted(admission) ? undefined : blockingFact(admission),
  }));

  return (
    <>
      <PageHeader
        group="Hall"
        title="Compose a Formula"
        network="Mainnet evidence"
        sentence="Draft what one share holds, from assayed instruments priced by live mainnet quotes. Nothing is founded here: founding is a separate step on the devnet Hall."
      />
      <Composer
        candidates={candidates}
        policy={{ version: admissions.policy_version, age: relativeEvidenceAge(admissions.as_of) }}
        unquoted={"problem" in key ? key.problem : undefined}
      />
    </>
  );
}
