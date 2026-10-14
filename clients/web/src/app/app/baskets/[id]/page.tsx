import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { headers } from "next/headers";
import { LotMark, QuietLink, RouteAction } from "@seametry/ui";
import { findAllocationIndex } from "@/lib/allocation/indexes";
import { allocationOffer, purchasesUnavailable } from "@/lib/allocation/offer";
import { logoOfSymbol } from "@/lib/instrument-identity";
import { BasketSparkline } from "../basket-history";
import { BasketPlate } from "../basket-plate";
import { AllocationFlow } from "../../allocation/flow";
import styles from "../baskets.module.css";

export default async function BasketDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string }> }) {
  await connection();
  const { id } = await params;
  // The flow keeps the unsigned amount in the URL so a wallet's in-app browser,
  // which shares no storage with Safari or Chrome, opens the same plan.
  const { amount } = await searchParams;
  const basket = findAllocationIndex(id);
  if (!basket) notFound();

  const { offered, refused, asOf, policyVersion } = allocationOffer();
  const unavailable = purchasesUnavailable(await headers());
  const bySymbol = new Map(offered.map((lot) => [lot.symbol, lot]));
  const refusedBySymbol = new Map(refused.map((lot) => [lot.symbol, lot]));
  const admitted = basket.members.map((member) => bySymbol.get(member.symbol)).filter((lot): lot is (typeof offered)[number] => Boolean(lot));
  const complete = !basket.researchOnly && admitted.length === basket.members.length;
  const capacity = admitted.length ? Math.min(...admitted.map((lot) => lot.capacityUsdc)) : 0;
  const issuers = [...new Set(admitted.map((lot) => lot.issuer))];
  const grades = [...new Set(admitted.map((lot) => lot.grade))];

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/app/baskets">Baskets</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{basket.name}</span>
      </nav>

      <section className={styles.detailHead}>
        <div className={styles.detailIdentity}>
          <div className={styles.detailTitle}>
            <BasketPlate size="header" code={basket.code} members={basket.members.map((member) => ({ symbol: member.symbol, admitted: !basket.researchOnly && bySymbol.has(member.symbol) }))} />
            <div>
              <span>{basket.category}</span>
              <h1>{basket.name}</h1>
            </div>
          </div>
          <p>{basket.description}</p>
          <p>{basket.thesis}</p>
        </div>
        <div className={styles.detailActions}>
          {basket.researchOnly ? (
            <p className={styles.detailBoundary}>{basket.researchBoundary}</p>
          ) : complete ? (
            <RouteAction href="#basket-order" icon="buy">Buy basket</RouteAction>
          ) : (
            <p className={styles.detailBoundary}>This published basket is incomplete under the current admissions snapshot and cannot be prepared for purchase as published.</p>
          )}
          {admitted.length > 0 ? (
            <div className={styles.remix}>
              <QuietLink href={`/app/baskets/build?basket=${encodeURIComponent(basket.id)}`} icon="next">Remix this basket</QuietLink>
              <p>
                {complete
                  ? "Start from this composition and change its constituents or their weights."
                  : `Start from the ${admitted.length} admitted ${admitted.length === 1 ? "constituent" : "constituents"} and add others.`}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {complete ? (
        <section className={styles.detailPurchase} id="basket-order" aria-labelledby="basket-order-heading">
          <header>
            <div>
              <span>Direct wallet ownership</span>
              <h2 id="basket-order-heading">Buy {basket.name}</h2>
              <p>Choose one USDC amount for the published composition. Every constituent is independently quoted and simulated before your wallet signs. No pooled basket token is issued.</p>
            </div>
          </header>
          <AllocationFlow
            offered={offered}
            refused={refused}
            unavailable={unavailable}
            initialSelected={admitted.map((lot) => lot.mint)}
            initialAmount={amount ?? ""}
            template={{ id: basket.id, name: basket.name, complete }}
            fixedTemplate
          />
        </section>
      ) : null}

      <section className={styles.detailSection} aria-labelledby="basket-observation">
        <h2 id="basket-observation">Routed acquisition history</h2>
        {basket.researchOnly ? <p>Research-only constituents have no executable basket history.</p> : <BasketSparkline id={basket.id} />}
        <p>Each observation is a 25 USDC Jupiter buy quote per admitted constituent, normalized to the first complete date. It is not NAV, a realized portfolio return or a promise that a purchase fills at that price.</p>
        <dl className={styles.detailFacts}>
          <div><dt>Admission</dt><dd>{basket.researchOnly ? "Research only" : admitted.length === basket.members.length ? `All ${admitted.length} admitted` : `${admitted.length} of ${basket.members.length} admitted`}</dd></div>
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
            const refusal = refusedBySymbol.get(member.symbol);
            return (
              <li key={member.symbol}>
                <LotMark symbol={member.symbol} src={lot?.logo ?? logoOfSymbol(member.symbol)} />
                {lot ? (
                  <>
                    <div><b>{member.symbol}</b><small>{lot.issuer}</small></div>
                    <span>{lot.grade}</span>
                    <span>{lot.capacityUsdc.toLocaleString()} USDC measured capacity</span>
                  </>
                ) : refusal ? (
                  <>
                    <div><b>{member.symbol}</b><small>Assayed under {policyVersion} and refused</small></div>
                    <span>Not offered</span>
                    <span>{refusal.fact}</span>
                  </>
                ) : (
                  <>
                    <div><b>{member.symbol}</b><small>Not yet assayed</small></div>
                    <span>Grade not established</span>
                    <span>No capture of this mint, so no decision</span>
                  </>
                )}
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
