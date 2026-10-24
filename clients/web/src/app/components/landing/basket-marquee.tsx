import Link from "next/link";
import { LotMark, QuietLink } from "@seametry/ui";
import { allocationIndexes } from "@/lib/allocation/indexes";
import { allocationOffer } from "@/lib/allocation/offer";
import { BasketPlate } from "../../app/baskets/basket-plate";
import { evidenceDate } from "../drawn/founding";
import styles from "./landing.module.css";

/**
 * components.md, Basket marquee. Every wholly admitted basket on one row and
 * every admitted stock on a second running the other way, each row written
 * twice so the loop has no seam (Storm, 24 October 2026: a marquee with very
 * little on it, replacing four photographed cards). The copy is inert, so a
 * keyboard and a screen reader meet each basket once.
 */
export function BasketMarquee() {
  const offer = allocationOffer();
  const offered = new Map(offer.offered.map((lot) => [lot.symbol, lot]));
  const buyable = allocationIndexes.filter((basket) => !basket.researchOnly && basket.members.every((member) => offered.has(member.symbol)));

  const baskets = (copy: boolean) => (
    <ul className={styles.marqueeTrack} aria-hidden={copy || undefined} inert={copy || undefined}>
      {buyable.map((basket) => (
        <li key={basket.id}>
          <Link className={styles.marqueeBasket} href={`/app/baskets/${encodeURIComponent(basket.id)}`}>
            <BasketPlate code={basket.code} members={basket.members.map((member) => ({ symbol: member.symbol, admitted: true }))} />
            <b>{basket.name}</b>
            <span>{basket.members.length} stocks</span>
          </Link>
        </li>
      ))}
    </ul>
  );
  const stocks = (copy: boolean) => (
    <ul className={styles.marqueeTrack} aria-hidden={copy || undefined}>
      {offer.offered.map((lot) => (
        <li key={lot.mint} className={styles.marqueeStock}>
          <LotMark symbol={lot.symbol} src={lot.logo} />
          <span>{lot.symbol}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className={styles.marquee}>
        <div className={styles.marqueeRow} aria-label="Baskets a wallet can buy" role="group">
          {baskets(false)}
          {baskets(true)}
        </div>
        <div className={styles.marqueeRow} data-reverse="" aria-label="Stocks admitted" role="group">
          {stocks(false)}
          {stocks(true)}
        </div>
      </div>
      <p className={styles.basketsNote}>
        <span>
          {buyable.length} baskets wholly admitted from {offer.offered.length} stocks under {offer.policyVersion}, {evidenceDate.format(new Date(offer.asOf))}. Each stock settles straight to your wallet; no basket token is issued.
        </span>
        <QuietLink href="/app/baskets" icon="arrow-up-right">All baskets</QuietLink>
      </p>
    </>
  );
}
