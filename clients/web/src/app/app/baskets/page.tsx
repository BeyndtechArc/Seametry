import type { Metadata } from "next";
import { connection } from "next/server";
import { allocationIndexes } from "@/lib/allocation/indexes";
import { allocationOffer } from "@/lib/allocation/offer";
import { PageHeader } from "../_shell/page-header";
import { BasketRegister } from "./basket-register";
import { BasketSectionNav } from "./section-nav";
import styles from "./baskets.module.css";

export const metadata: Metadata = {
  title: "Baskets | Seametry",
  description: "Researched direct-wallet baskets built from admitted tokenized equities.",
};

export default async function BasketsPage() {
  await connection();
  const { offered, asOf, policyVersion } = allocationOffer();

  return (
    <div className={styles.page}>
      <PageHeader
        group="Allocation"
        title="Baskets"
        network="Mainnet"
        info={
          <>
            <p>Published themes for direct-wallet ownership. Buying a basket purchases each admitted constituent into your wallet; no pooled basket token is issued.</p>
            <p>Admission comes from policy {policyVersion}, observed at {new Date(asOf).toUTCString()}. Reference charts never set execution terms.</p>
          </>
        }
      />
      <BasketSectionNav current="baskets" />
      <BasketRegister baskets={allocationIndexes} offered={offered} />
    </div>
  );
}
