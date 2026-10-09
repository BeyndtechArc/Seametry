import type { Metadata } from "next";
import { connection } from "next/server";
import { admissions, blockingFact, gradeOf, isAdmitted } from "@/lib/allocation/admissions";
import { quoteKey } from "@/lib/compose/quote-config";
import { MAX_CONSTITUENTS } from "@/lib/hall/constants";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { PageHeader } from "../_shell/page-header";
import { Composer, type Candidate } from "./composer";

export const metadata: Metadata = {
  title: "Sponsor an Alloy | Seametry",
  description: "Set an Alloy's fixed Formula from assayed instruments, name it and found it as its sponsor.",
};

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ selected?: string; add?: string }> }) {
  await connection();
  const { selected, add } = await searchParams;
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
        title="Sponsor an Alloy"
        network="Mainnet evidence"
        info={
          <>
            <p>A sponsor sets what one share holds, names the Alloy and signs its founding on the devnet Hall.</p>
            <p>Composing is the draft. Founding fixes that Formula on-chain; it cannot be edited or rebalanced afterward.</p>
            <p>
              Only instruments captured and assayed by the policy engine can enter a Formula ({admissions.policy_version}, captured {relativeEvidenceAge(admissions.as_of)} ago). To
              add another stock, capture it first.
            </p>
          </>
        }
      />
      <Composer
        candidates={candidates}
        unquoted={"problem" in key ? key.problem : undefined}
        initialSelected={candidates.filter((candidate) => candidate.admitted && ((selected?.split(",") ?? []).includes(candidate.mint) || add === candidate.mint)).slice(0, MAX_CONSTITUENTS).map((candidate) => candidate.mint)}
      />
    </>
  );
}
