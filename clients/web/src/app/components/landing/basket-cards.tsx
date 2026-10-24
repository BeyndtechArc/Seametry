import Link from "next/link";
import { LotMark, QuietLink } from "@seametry/ui";
import { allocationIndexes } from "@/lib/allocation/indexes";
import { allocationOffer } from "@/lib/allocation/offer";
import { photos, type Photo } from "@/lib/photos";
import { BasketPlate } from "../../app/baskets/basket-plate";
import { evidenceDate } from "./founding";
import styles from "./landing.module.css";

// A basket's theme photograph is a landing decision, not part of the
// published basket, so it lives here. Only baskets named here are featured,
// in the published order (Storm, 24 October 2026: the first four).
const covers: Record<string, Photo> = {
  "prime-seven": photos.glassTowers,
  "compute-chain": photos.siliconWafer,
  "ai-cloud": photos.serverCabinets,
  "physical-ai": photos.robotArm,
};

/** components.md, Basket card. */
export function BasketCards() {
  const offer = allocationOffer();
  const offered = new Map(offer.offered.map((lot) => [lot.symbol, lot]));
  const admittedIn = (members: readonly { symbol: string }[]) => members.filter((member) => offered.has(member.symbol)).length;
  const buyable = allocationIndexes.filter((basket) => !basket.researchOnly && admittedIn(basket.members) === basket.members.length);
  const featured = buyable.filter((basket) => basket.id in covers);

  return (
    <>
      <ul className={styles.baskets}>
        {featured.map((basket) => {
          const cover = covers[basket.id];
          return (
            <li key={basket.id}>
              <Link className={styles.basketCard} href={`/app/baskets/${encodeURIComponent(basket.id)}`} aria-label={basket.name}>
                <span className={styles.basketCover}>
                  <span className={styles.photoGround}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- next/image writes an inline style attribute, which this site's CSP refuses, and its transformations count against the hosting plan; the file is already sized. */}
                    <img src={cover.src} width={cover.width} height={cover.height} alt="" loading="lazy" decoding="async" />
                  </span>
                  <BasketPlate code={basket.code} members={basket.members.map((member) => ({ symbol: member.symbol, admitted: true }))} />
                </span>
                <span className={styles.basketText}>
                  <span className={styles.basketCode}>{basket.code}</span>
                  <b>{basket.name}</b>
                  <span>{basket.category}</span>
                </span>
                <span className={styles.basketHolds}>
                  <span className={styles.basketStack}>
                    {basket.members.map((member) => <LotMark key={member.symbol} symbol={member.symbol} src={offered.get(member.symbol)?.logo} />)}
                  </span>
                  <span>{basket.members.length} stocks, all admitted</span>
                </span>
                <small className={styles.basketCredit}>Photo: {cover.photographer}, Unsplash</small>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className={styles.basketsNote}>
        <span>
          {buyable.length} published baskets are wholly admitted under {offer.policyVersion}, snapshot of {evidenceDate.format(new Date(offer.asOf))}. Buying one purchases each stock into your wallet on Solana mainnet where eligibility allows; no basket token is issued. Photographs are illustrative.
        </span>
        <QuietLink href="/app/baskets" icon="arrow-up-right">All baskets</QuietLink>
      </p>
    </>
  );
}
