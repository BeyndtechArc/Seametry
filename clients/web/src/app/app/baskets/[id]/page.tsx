import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LotMark } from "@seametry/ui";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { allocationOffer } from "@/lib/allocation/offer";
import { BasketSparkline } from "../basket-history";
import { BasketSectionNav } from "../section-nav";
import styles from "../baskets.module.css";

export default async function BasketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const basket = findAllocationIndex(id);
  if (!basket) notFound();

  const { offered, asOf, policyVersion } = allocationOffer();
  const bySymbol = new Map(offered.map((lot) => [lot.symbol, lot]));
  const admitted = basket.members.map((member) => bySymbol.get(member.symbol)).filter((lot): lot is (typeof offered)[number] => Boolean(lot));
  const complete = !basket.researchOnly && admitted.length === basket.members.length;
  const capacity = admitted.length ? Math.min(...admitted.map((lot) => lot.capacityUsdc)) : 0;
  const issuers = [...new Set(admitted.map((lot) => lot.issuer))];
  const grades = [...new Set(admitted.map((lot) => lot.grade))];

  return (
    <div className={styles.page}>
      <BasketSectionNav current="baskets" />
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/app/baskets">Baskets</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{basket.name}</span>
      </nav>

      <section className={styles.detailHead}>
        <div className={styles.detailIdentity}>
          <span>{basket.code} · {basket.category}</span>
          <h1>{basket.name}</h1>
          <p>{basket.description}</p>
          <p>{basket.thesis}</p>
        </div>
        <div className={styles.detailActions}>
          {basket.researchOnly ? (
            <p className={styles.detailBoundary}>{basket.researchBoundary}</p>
          ) : complete ? (
            <Link className={styles.detailAction} href={"/app/baskets/build?basket=" + encodeURIComponent(basket.id)}>Build this basket</Link>
          ) : (
            <p className={styles.detailBoundary}>This published basket is incomplete under the current admissions snapshot and cannot be prepared for purchase.</p>
          )}
        </div>
      </section>

      <section className={styles.detailSection} aria-labelledby="basket-observation">
        <h2 id="basket-observation">Routed acquisition history</h2>
        {basket.researchOnly ? <p>Research-only constituents have no executable basket history.</p> : <BasketSparkline id={basket.id} />}
        <p>Each observation is a 25 USDC Jupiter buy quote per admitted constituent, normalized to the first complete date. It is not NAV, a realized portfolio return or a guaranteed fill.</p>
        <dl className={styles.detailFacts}>
          <div><dt>Admission</dt><dd>{basket.researchOnly ? "Research only" : admitted.length + "/" + basket.members.length + " admitted"}</dd></div>
          <div><dt>Issuers</dt><dd>{issuers.length ? issuers.join(" · ") : "No admitted issuer observation"}</dd></div>
          <div><dt>Measured capacity</dt><dd>{capacity > 0 ? capacity.toLocaleString() + " USDC minimum across legs" : "No executable observation"}</dd></div>
        </dl>
      </section>

      <section className={styles.detailSection} aria-labelledby="basket-composition">
        <h2 id="basket-composition">Composition</h2>
        <p>Equal weighting is the current published construction rule. It is methodology, not a promise that value weights will stay equal after purchase.</p>
        <ol className={styles.constituentRows}>
          {basket.members.map((member) => {
            const lot = bySymbol.get(member.symbol);
            return (
              <li key={member.symbol}>
                <LotMark symbol={member.symbol} src={lot?.logo} />
                <div><b>{member.symbol}</b><small>{lot?.issuer ?? "Research instrument, not admitted"}</small></div>
                <span>{lot ? lot.grade : "Grade not established"}</span>
                <span>{lot ? lot.capacityUsdc.toLocaleString() + " USDC measured capacity" : "No execution route admitted"}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.detailSection} aria-labelledby="basket-method">
        <h2 id="basket-method">Method</h2>
        <dl className={styles.detailFacts}>
          <div><dt>Methodology</dt><dd>{basket.researchOnly ? "Private-market research rule 0.1" : "Equal weight · published rule 0.1"}</dd></div>
          <div><dt>Review</dt><dd>{basket.review}</dd></div>
          <div><dt>Drift trigger</dt><dd>{basket.driftBandPp} percentage points before Seametry proposes a holder-approved rebalance</dd></div>
        </dl>
        <p>Admission snapshot: policy {policyVersion}, observed {new Date(asOf).toUTCString()}. Existing holdings are never silently changed when the published basket changes.</p>
        {basket.literature?.length ? (
          <div className={styles.literature} aria-label="Literature">
            {basket.literature.map((item) => <a key={item.href} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>)}
          </div>
        ) : null}
      </section>

      {grades.length ? <p className={styles.registerNote}>Observed Grades in the currently admitted representations: {grades.join(" · ")}.</p> : null}
    </div>
  );
}
