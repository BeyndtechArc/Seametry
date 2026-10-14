"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, LotMark, TextAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import type { AllocationIndex, BasketFilter } from "@/lib/allocation/indexes";
import type { OfferedLot } from "@/lib/allocation/offer";
import { BasketPlate } from "./basket-plate";
import styles from "./baskets.module.css";

const themes: { value: "any" | BasketFilter; label: string }[] = [
  { value: "any", label: "Any theme" },
  { value: "megacap", label: "Megacap technology" },
  { value: "ai-compute", label: "AI and compute" },
  { value: "cloud-software", label: "Cloud and software" },
  { value: "media", label: "Media" },
  { value: "space-frontier", label: "Space and defense" },
  { value: "digital-capital", label: "Digital capital" },
  { value: "global-markets", label: "Global ETFs" },
  { value: "private-markets", label: "Private markets" },
];

const access: { value: "any" | BasketFilter; label: string }[] = [
  { value: "any", label: "Any issuer" },
  { value: "backpack", label: "Backpack" },
  { value: "xstocks", label: "xStocks" },
];

function accessLabel(basket: AllocationIndex) {
  const backpack = basket.filters.includes("backpack");
  const xstocks = basket.filters.includes("xstocks");
  if (backpack && xstocks) return "Backpack and xStocks";
  if (backpack) return "Backpack";
  if (xstocks) return "xStocks";
  return "Mixed issuers";
}

function admissionLabel(basket: AllocationIndex, admitted: number) {
  if (basket.researchOnly) return "Research only";
  if (admitted === basket.members.length) return `All ${admitted} admitted`;
  return `${admitted} of ${basket.members.length} admitted`;
}

/** components.md, Basket register: one route link per ruled row, the Alloy register's grammar. */
export function BasketRegister({ baskets, offered }: { baskets: readonly AllocationIndex[]; offered: OfferedLot[] }) {
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("any");
  const [issuer, setIssuer] = useState("any");
  const bySymbol = useMemo(() => new Map(offered.map((lot) => [lot.symbol, lot])), [offered]);

  const needle = query.trim().toLowerCase();
  const visible = baskets.filter((basket) => {
    const tagged = (value: string) => value === "any" || basket.filters.includes(value as BasketFilter);
    const haystack = [basket.name, basket.code, basket.category, ...basket.members.map((member) => member.symbol)].join(" ").toLowerCase();
    return tagged(theme) && tagged(issuer) && (!needle || haystack.includes(needle));
  });

  return (
    <section className={styles.register} aria-label="Published baskets">
      <FilterBar
        searchLabel="Search baskets or constituents"
        query={query}
        onQuery={setQuery}
        groups={[
          { name: "basket-theme", label: "Theme", value: theme, options: themes, onChange: setTheme },
          { name: "basket-access", label: "Access", value: issuer, options: access, onChange: setIssuer },
        ]}
        shown={visible.length}
        total={baskets.length}
      />

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <b>No basket matches this search and these filters.</b>
          <p>Clear the search or set Theme and Access back to any.</p>
        </div>
      ) : (
        <ol className={styles.basketRows} aria-label="Published basket register">
          {visible.map((basket) => {
            const members = basket.members.map((member) => ({ symbol: member.symbol, lot: basket.researchOnly ? undefined : bySymbol.get(member.symbol) }));
            const admitted = members.filter((member) => member.lot).length;
            return (
              <li key={basket.id}>
                <Link className={styles.basketRow} href={"/app/baskets/" + encodeURIComponent(basket.id)} aria-label={basket.name}>
                  <span className={styles.basketIdentity}>
                    <BasketPlate code={basket.code} members={members.map((member) => ({ symbol: member.symbol, admitted: Boolean(member.lot) }))} />
                    <span className={styles.basketIdentityText}>
                      <b>{basket.name}</b>
                      <span>{basket.category}</span>
                    </span>
                  </span>

                  <span className={styles.basketCell} data-cell="holds">
                    <small>Holds</small>
                    <span className={styles.basketLotStack}>
                      {members.map((member) => <LotMark key={member.symbol} symbol={member.symbol} src={member.lot?.logo} />)}
                    </span>
                    <span>{basket.members.length} constituents</span>
                  </span>

                  <span className={styles.basketCell} data-cell="access">
                    <small>Access</small>
                    <span>{accessLabel(basket)}</span>
                  </span>

                  <span className={styles.basketCell}>
                    <small>Admission</small>
                    <span>{admissionLabel(basket, admitted)}</span>
                  </span>

                  <span className={styles.basketRowArrow} aria-hidden="true"><Icon name="next" /></span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {/* The same Allocation destination appears in the app navigation. */}
      <p className={styles.registerClose}>
        <span>A different composition from admitted instruments.</span>
        <TextAction href="/app/baskets/build" icon="next">Allocation</TextAction>
      </p>
    </section>
  );
}
