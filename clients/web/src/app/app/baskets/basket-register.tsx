"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LotMark } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import type { AllocationIndex, BasketFilter } from "@/lib/allocation/indexes";
import type { OfferedLot } from "@/lib/allocation/offer";
import { BasketEmblem } from "./basket-emblem";
import styles from "./baskets.module.css";

type FilterKey = "all" | "ai-compute" | "cloud-software" | "space-frontier" | "digital-capital" | "global-markets" | "backpack" | "xstocks" | "private-markets";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ai-compute", label: "AI & compute" },
  { key: "cloud-software", label: "Cloud & software" },
  { key: "space-frontier", label: "Space & defense" },
  { key: "digital-capital", label: "Digital capital" },
  { key: "global-markets", label: "Global ETFs" },
  { key: "backpack", label: "Backpack" },
  { key: "xstocks", label: "xStocks" },
  { key: "private-markets", label: "Private / pre-IPO" },
];

function accessLabel(basket: AllocationIndex) {
  if (basket.researchOnly) return "Mixed access";
  const backpack = basket.filters.includes("backpack");
  const xstocks = basket.filters.includes("xstocks");
  if (backpack && xstocks) return "Backpack + xStocks";
  if (backpack) return "Backpack";
  if (xstocks) return "xStocks";
  return "Mixed issuers";
}

export function BasketRegister({ baskets, offered }: { baskets: readonly AllocationIndex[]; offered: OfferedLot[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
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
          <p>Curated themes built from tokenized instruments. Open a row for the full composition, evidence and purchase flow.</p>
        </div>
        <div className={styles.registerTools}>
          <label className={styles.search}>
            <span className={styles.visuallyHidden}>Search baskets</span>
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search baskets" />
          </label>
          <div className={styles.filterControl}>
            <button
              type="button"
              className={styles.filterButton}
              aria-label="Filters"
              aria-expanded={filtersOpen}
              aria-controls="basket-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon name="filter" />
              <span>Filters</span>
              {filter !== "all" ? <b>1</b> : null}
            </button>
            {filtersOpen ? (
              <div className={styles.filterMenu} id="basket-filters" role="dialog" aria-label="Basket filters">
                <div className={styles.filterMenuHead}>
                  <span>Filter baskets</span>
                  <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><Icon name="close" /></button>
                </div>
                <div className={styles.filterOptions}>
                  {filters.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={filter === item.key}
                      onClick={() => { setFilter(item.key); setFiltersOpen(false); }}
                    >
                      <span>{item.label}</span>
                      {filter === item.key ? <Icon name="check" /> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <p className={styles.resultCount}>
        {visible.length} of {baskets.length} baskets{filter !== "all" ? " · " + filters.find((item) => item.key === filter)?.label : ""}
      </p>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <b>No baskets match this view.</b>
          <p>Clear the search or widen the filter.</p>
        </div>
      ) : (
        <ol className={styles.basketRows} aria-label="Published basket register">
          {visible.map((basket) => {
            const admitted = basket.members.map((member) => bySymbol.get(member.symbol)).filter((lot): lot is OfferedLot => Boolean(lot));
            const available = !basket.researchOnly && admitted.length === basket.members.length;
            const state = basket.researchOnly ? "Research" : available ? "Available" : admitted.length + "/" + basket.members.length + " admitted";

            return (
              <li key={basket.id} data-state={available ? "available" : "research"}>
                <Link className={styles.basketRow} href={"/app/baskets/" + encodeURIComponent(basket.id)} aria-label={basket.name}>
                  <span className={styles.basketIdentity}>
                    <span className={styles.basketAvatar}><BasketEmblem basketId={basket.id} /></span>
                    <span className={styles.basketIdentityText}>
                      <b>{basket.name}</b>
                      <small>{basket.category}</small>
                      <span>{basket.description}</span>
                    </span>
                  </span>

                  <span className={styles.basketComposition}>
                    <span className={styles.basketLotStack} aria-hidden="true">
                      {basket.members.slice(0, 6).map((member) => {
                        const lot = bySymbol.get(member.symbol);
                        return <LotMark key={member.symbol} symbol={member.symbol} src={lot?.logo} />;
                      })}
                    </span>
                    <small>{basket.members.length} constituents</small>
                  </span>

                  <span className={styles.basketAccess}>
                    <small>Access</small>
                    <b>{accessLabel(basket)}</b>
                  </span>

                  <span className={styles.basketState}>
                    <small>Status</small>
                    <b>{state}</b>
                  </span>

                  <span className={styles.basketRowArrow} aria-hidden="true"><Icon name="next" /></span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
