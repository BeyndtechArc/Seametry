"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

export function BasketRegister({ baskets, offered }: { baskets: readonly AllocationIndex[]; offered: OfferedLot[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const admittedSymbols = useMemo(() => new Set(offered.map((lot) => lot.symbol)), [offered]);

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
          <p>One theme, several instruments. Examine a basket before you buy.</p>
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
            const covered = basket.members.filter((member) => admittedSymbols.has(member.symbol)).length;
            const available = !basket.researchOnly && covered === basket.members.length;
            const state = basket.researchOnly ? "Research" : available ? "Available" : "Admission pending";
            return (
              <li key={basket.id} data-state={available ? "available" : "research"}>
                <Link className={styles.basketRow} href={"/app/baskets/" + encodeURIComponent(basket.id)} aria-label={basket.name}>
                  <span className={styles.basketAvatar}><BasketEmblem basketId={basket.id} /></span>
                  <span className={styles.basketRowIdentity}>
                    <b>{basket.name}</b>
                    <small>{basket.category}</small>
                  </span>
                  <span className={styles.basketRowMembers}>{basket.members.length} constituents</span>
                  <span className={styles.basketRowStatus}>{state}</span>
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
