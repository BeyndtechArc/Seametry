"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@seametry/ui/icons";
import { ThemeControl } from "@seametry/ui/theme-control";
import { BrandMark } from "../../brand-mark";
import { WalletState } from "../../wallet-state";
import { appGroups, readingRoutes } from "./routes";
import styles from "./app-shell.module.css";

/** components.md, App shell: one top bar carries the product routes on wide layouts and discloses them in a register on narrow ones. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner} data-testid="app-header-inner">
          <BrandMark href="/app" compactOnNarrow />
          <nav aria-label="Product" className={styles.productNav}>
            {appGroups.flatMap(({ icon, routes }) => routes.map((route) => ({ ...route, icon }))).map((route) => {
              const current = route.isActive(pathname);
              return (
                <Link key={route.href} href={route.href} aria-current={current ? "page" : undefined}>
                  {current ? <Icon name={route.icon} /> : null}
                  {route.label}
                </Link>
              );
            })}
          </nav>
          <div className={styles.headerActions} data-testid="app-header-actions">
            <WalletState />
            <span className={styles.theme} data-testid="app-header-theme"><ThemeControl /></span>
            <button
              className={styles.menuControl}
              type="button"
              aria-expanded={menuOpen}
              aria-controls="app-mobile-navigation"
              aria-label={menuOpen ? "Close product navigation" : "Open product navigation"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M5 7h14M5 12h14M5 17h14" />}
              </svg>
            </button>
          </div>
          {menuOpen ? (
            <div id="app-mobile-navigation" className={styles.mobileRegister}>
              <nav aria-label="Mobile product">
                {appGroups.map(({ group, routes }, groupIndex) => (
                  <div key={group} className={styles.mobileGroup}>
                    <small>0{groupIndex + 1} / {group}</small>
                    {routes.map((route) => (
                      <Link key={route.href} href={route.href} aria-current={route.isActive(pathname) ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                        {route.label}
                      </Link>
                    ))}
                  </div>
                ))}
                <div className={styles.mobileReading}>
                  {readingRoutes.map((route) => (
                    <Link key={route.href} href={route.href} onClick={() => setMenuOpen(false)}>{route.label}</Link>
                  ))}
                </div>
              </nav>
            </div>
          ) : null}
        </div>
      </header>
      <main className={styles.content}>{children}</main>
      <footer className={styles.statusBar}>
        <nav aria-label="Reading" className={styles.statusInner}>
          {readingRoutes.map((route) => (
            <Link key={route.href} href={route.href}>
              <Icon name={route.icon} />
              <span>{route.label}</span>
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
