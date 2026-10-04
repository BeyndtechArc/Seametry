"use client";

import { useState, type ReactNode } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

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
        <span className={styles.hallPilaster} data-testid="hall-pilaster" aria-hidden="true" />
      </aside>

      <div className={styles.body}>
        <header className={styles.topBar}>
          <div className={styles.topBarInner} data-testid="app-header-inner">
            <span className={styles.narrowBrand}>
              <BrandMark href="/app" compactOnNarrow />
            </span>
            {place ? (
              <p className={styles.place}>
                <b>{place.group === "Desk" ? place.label : place.group}</b>
              </p>
            ) : null}
            <div className={styles.controlRail} data-testid="app-header-controls">
              <div className={styles.tools} data-testid="app-header-tools">
                <ThemeControl />
                <WalletState />
              </div>
              <button
                className={styles.menuControl}
                type="button"
                aria-expanded={menuOpen}
                aria-controls="app-mobile-navigation"
                aria-label={menuOpen ? "Close product navigation" : "Open product navigation"}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h11" />}
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
      </div>
    </div>
  );
}
