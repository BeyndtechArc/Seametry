import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { headers } from "next/headers";
import { admissions } from "@/lib/allocation/admissions";
import { allocationOffer, purchasesUnavailable } from "@/lib/allocation/offer";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { SLIPPAGE_BPS, feeSchedule } from "@/lib/allocation/rules";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import { PageHeader } from "../_shell/page-header";
import { AllocationFlow } from "./flow";
import styles from "./allocation.module.css";

export const metadata: Metadata = {
  title: "Allocation | Seametry",
  description: "Build a direct-wallet Allocation from admitted tokenized equities, with every constituent checked before you sign.",
};

export default async function AllocationPage({ searchParams }: { searchParams: Promise<{ selected?: string; add?: string; amount?: string; weights?: string; index?: string; basket?: string }> }) {
  await connection();
  const { selected, add, amount, weights, index: legacyIndexId, basket: basketId } = await searchParams;
  const indexId = basketId ?? legacyIndexId;
  const unavailable = purchasesUnavailable(await headers());
  const { offered, refused: refusedLots } = allocationOffer();
  const activeIndex = findAllocationIndex(indexId);
  const indexLots = activeIndex
    ? activeIndex.members.map((member) => offered.find((lot) => lot.symbol === member.symbol)).filter((lot): lot is (typeof offered)[number] => Boolean(lot))
    : [];
  const leftOut = activeIndex ? activeIndex.members.filter((member) => !indexLots.some((lot) => lot.symbol === member.symbol)).map((member) => member.symbol) : [];
  const selectedMints = selected?.split(",") ?? [];
  const explicitMints = offered.filter((lot) => selectedMints.includes(lot.mint) || add === lot.mint).map((lot) => lot.mint);
  // The flow writes selected back to the URL as the reader edits a remix, so
  // an explicit selection is the newer intent and wins over the basket it began from.
  const initialSelected = explicitMints.length > 0 ? explicitMints : indexLots.map((lot) => lot.mint);
  const weightList = weights?.split(",") ?? [];
  const initialWeights = weightList.length > 0 && weightList.length === selectedMints.length
    ? Object.fromEntries(selectedMints.map((mint, index) => [mint, weightList[index]]))
    : undefined;

  return (
    <div className={styles.page}>
        <PageHeader
          title="Allocation"
          network="Mainnet"
          info={
            <>
              <p>One swap per constituent, each settling to your wallet. Nothing is pooled and no basket token is issued.</p>
              <p>
                Seametry&apos;s routing fee falls as the basket grows: {feeSchedule()}. Slippage tolerance is {formatAmount(BigInt(SLIPPAGE_BPS), 2)}%. Both are
                lines on the order sheet, and every swap is freshly quoted and simulated before you sign.
              </p>
              <p>
                Constituents are admitted by policy {admissions.policy_version} from a snapshot captured{" "}
                <time dateTime={admissions.as_of}>{new Date(admissions.as_of).toUTCString().slice(5, 16)}</time>, {relativeEvidenceAge(admissions.as_of)} old, not a
                live issuer read.
              </p>
              <p>You remain bound by each issuer&apos;s terms of eligibility.</p>
            </>
          }
        />
        {activeIndex ? (
          <p className={styles.remixNote} role="note">
            Remixing <Link href={`/app/baskets/${encodeURIComponent(activeIndex.id)}`}>{activeIndex.name}</Link>.{" "}
            {leftOut.length > 0
              ? `${leftOut.join(", ")} ${leftOut.length === 1 ? "is" : "are"} left out: the current snapshot does not admit ${leftOut.length === 1 ? "it" : "them"}, and the basket record names why.`
              : "Every constituent starts chosen at equal weight; change either before you buy."}
          </p>
        ) : null}
        <AllocationFlow
          offered={offered}
          refused={refusedLots}
          unavailable={unavailable}
          initialSelected={initialSelected}
          initialAmount={amount ?? ""}
          initialWeights={initialWeights}
          template={activeIndex ? { id: activeIndex.id, name: activeIndex.name, complete: !activeIndex.researchOnly && leftOut.length === 0 } : undefined}
        />
    </div>
  );
}
