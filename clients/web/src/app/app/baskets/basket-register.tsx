"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LotMark } from "@seametry/ui";
import type { AllocationIndex, BasketFilter } from "@/lib/allocation/indexes";
import type { OfferedLot } from "@/lib/allocation/offer";
import { BasketSparkline } from "./basket-history";
import styles from "./baskets.module.css";

type FilterKey = "all" | "ai-compute" | "cloud-software" | "space-frontier" | "backpack" | "xstocks" | "private-markets";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai-compute", label: "AI & compute" },
  { key: "cloud-software", label: "Cloud & software" },
  { key: "space-frontier", label: "Space & frontier" },
  { key: "backpack", label: "Backpack" },
  { key: "xstocks", label: "xStocks" },
  { key: "private-markets", label: "Private / pre-IPO" },
];

function providerLabel(lots: OfferedLot[]) {
  const issuers = [...new Set(lots.map((lot) => lot.issuer))];
  if (issuers.length === 0) return "Research";
  if (issuers.length === 1) return issuers[0].includes("Backpack") ? "Backpack" : issuers[0].includes("xStocks") ? "xStocks" : issuers[0];
  return "Mixed issuers";
}

export function BasketRegister({ baskets, offered }: { baskets: readonly AllocationIndex[]; offered: OfferedLot[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const bySymbol = useMemo(() => new Map(offered.map((lot) => [lot.symbol, lot])), [offered]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return baskets.filter((basket) => {
      const matchesFilter = filter === "all" || basket.filters.includes(filter as BasketFilter);
      const haystack = [basket.name, basket.code, basket.category, basket.description, ...basket.members.map((member) => member.symbol)].join(" ").toLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }, [baskets, filter, query]);

  return (
    <section className={styles.register} aria-labelledby="basket-register-title">
      <header className={styles.registerHead}>
        <div>
          <h2 id="basket-register-title">Published baskets</h2>
          <p>Themes are researched and versioned. Constituents still settle directly into your wallet.</p>
        </div>
        <label className={styles.search}>
          <span>Search baskets</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Theme, company or ticker" />
        </label>
      </header>

      <div className={styles.filterRail} aria-label="Filter baskets">
        {filters.map((item) => (
          <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      <p className={styles.resultCount}>Showing {visible.length} of {baskets.length} baskets.</p>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <b>No baskets match this view.</b>
          <p>Clear the search or widen the filter.</p>
        </div>
      ) : (
        <ol className={styles.basketRows}>
          {visible.map((basket) => {
            const admitted = basket.members.map((member) => bySymbol.get(member.symbol)).filter((lot): lot is OfferedLot => Boolean(lot));
            const complete = !basket.researchOnly && admitted.length === basket.members.length;
            const capacity = admitted.length ? Math.min(...admitted.map((lot) => lot.capacityUsdc)) : 0;
            return (
              <li key={basket.id} data-research={basket.researchOnly || undefined}>
                <Link className={styles.basketIdentity} href={"/app/baskets/" + encodeURIComponent(basket.id)}>
                  <span className={styles.basketCode}>{basket.code}</span>
                  <span>
                    <b>{basket.name}</b>
                    <small>{basket.category}</small>
                    <p>{basket.description}</p>
                  </span>
                </Link>

                <div className={styles.composition}>
                  <small>Composition</small>
                  <span className={styles.lotStack} aria-label={basket.members.map((member) => member.symbol).join(", ")}>
                    {basket.members.slice(0, 7).map((member) => {
                      const lot = bySymbol.get(member.symbol);
                      return <LotMark key={member.symbol} symbol={member.symbol} src={lot?.logo} />;
                    })}
                  </span>
                  <span>{basket.members.map((member) => member.symbol).join(" · ")}</span>
                </div>

                <div className={styles.reference}>
                  <small>Reference · 30d</small>
                  {basket.researchOnly ? <span className={styles.researchState}>Not admitted</span> : <BasketSparkline id={basket.id} compact />}
                </div>

                <div className={styles.access}>
                  <small>Access</small>
                  <b>{basket.researchOnly ? "Research" : admitted.length + "/" + basket.members.length + " admitted"}</b>
                  <span>{providerLabel(admitted)}</span>
                  {!basket.researchOnly && capacity > 0 ? <span>{capacity.toLocaleString()} USDC measured capacity floor</span> : null}
                </div>

                <Link className={styles.openBasket} href={"/app/baskets/" + encodeURIComponent(basket.id)}>
                  {complete ? "Open basket" : "Inspect research"}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      <p className={styles.registerNote}>Reference charts are informational. Execution uses fresh constituent quotes at the amount you choose.</p>
    </section>
  );
}
