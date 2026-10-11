import type { Metadata } from "next";
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
import { BasketSectionNav } from "../baskets/section-nav";
import styles from "./allocation.module.css";

export const metadata: Metadata = {
  title: "Buy an Allocation | Seametry",
  description: "Plan and buy several admitted tokenized stocks directly into your own wallet, with every purchase shown before you sign.",
};

export default async function AllocationPage({ searchParams }: { searchParams: Promise<{ selected?: string; add?: string; amount?: string; index?: string; basket?: string }> }) {
  await connection();
  const { selected, add, amount, index: legacyIndexId, basket: basketId } = await searchParams;
  const indexId = basketId ?? legacyIndexId;
  const unavailable = purchasesUnavailable(await headers());
  const { offered, refused: refusedLots } = allocationOffer();
  const activeIndex = findAllocationIndex(indexId);
  const indexMints = activeIndex
    ? activeIndex.members.map((member) => offered.find((lot) => lot.symbol === member.symbol)?.mint).filter((mint): mint is string => Boolean(mint))
    : [];
  const explicitMints = offered.filter((lot) => (selected?.split(",") ?? []).includes(lot.mint) || add === lot.mint).map((lot) => lot.mint);
  const initialSelected = activeIndex && indexMints.length === activeIndex.members.length ? indexMints : explicitMints;

  return (
    <div className={styles.page}>
        <PageHeader
          group="Allocation"
          title="Buy an Allocation"
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
        <BasketSectionNav current="build" />
        <AllocationFlow
          offered={offered}
          refused={refusedLots}
          unavailable={unavailable}
          initialSelected={initialSelected}
          initialAmount={amount ?? ""}
          allocationName={activeIndex?.name ?? "Custom allocation"}
          allocationTemplateId={activeIndex?.id}
        />
    </div>
  );
}
