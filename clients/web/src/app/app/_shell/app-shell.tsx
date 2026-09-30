"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@seametry/ui/icons";
import { ThemeControl } from "@seametry/ui/theme-control";
import { BrandMark } from "../../brand-mark";
import { WalletState } from "../../wallet-state";
import { appGroups, currentPlace, readingRoutes } from "./routes";
import styles from "./app-shell.module.css";

/** components.md, App shell: sidebar on wide layouts, tab bar on narrow ones, one route list behind both. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const place = currentPlace(pathname);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <BrandMark href="/app" />
        <nav aria-label="Product">
          {appGroups.map(({ group, routes }) => (
            <div key={group} className={styles.group}>
              <span>{group}</span>
              {routes.map((route) => (
                <Link key={route.href} href={route.href} aria-current={route.isActive(pathname) ? "page" : undefined}>
                  <span>{route.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <nav aria-label="Reading" className={styles.reading}>
          {readingRoutes.map((route) => (
            <Link key={route.href} href={route.href}>
              <span className={styles.readingIcon}><Icon name={route.icon} /></span>
              <span>{route.label}</span>
            </Link>
          ))}
        </nav>
        <span className={styles.sponsorField} aria-hidden="true" />
      </aside>

      <div className={styles.body}>
        <header className={styles.topBar}>
          <span className={styles.narrowBrand}>
            <BrandMark href="/app" />
          </span>
          {place ? (
            <p className={styles.place}>
              <b>{place.group === "Desk" ? place.label : place.group}</b>
            </p>
          ) : null}
          <div className={styles.tools}>
            <WalletState />
            <ThemeControl />
          </div>
        </header>
        <main className={styles.content}>{children}</main>
      </div>

      <nav aria-label="Product sections" className={styles.tabBar}>
        {appGroups.map(({ group, routes }) => (
          <Link
            key={group}
            href={routes[0].href}
            aria-current={routes.some((route) => route.isActive(pathname)) ? "page" : undefined}
          >
            {group}
          </Link>
        ))}
      </nav>
    </div>
  );
}
