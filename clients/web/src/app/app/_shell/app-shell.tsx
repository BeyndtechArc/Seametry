"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@seametry/ui/icons";
import { ThemeControl } from "@seametry/ui/theme-control";
import { BrandMark } from "../../brand-mark";
import { WalletState } from "../../wallet-state";
import { appGroups, mobileRoutes, readingRoutes } from "./routes";
import styles from "./app-shell.module.css";

/** components.md, App shell: the top bar carries wide routes; the bottom tabs keep product routes within reach on phones. */
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
            <span className={styles.theme} data-testid="app-header-theme"><ThemeControl defaultTheme="dark" /></span>
            <button
              type="button"
              className={styles.mobileMenuButton}
              aria-label="Open more navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>
      {menuOpen ? (
        <div className={styles.mobileMenuLayer}>
          <button className={styles.mobileMenuScrim} type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />
          <aside className={styles.mobileMenu} aria-label="More navigation">
            <div className={styles.mobileMenuHead}>
              <span>More</span>
              <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
            </div>
            <nav className={styles.mobileMenuRoutes}>
              {appGroups.flatMap(({ icon, routes }) => routes.map((route) => ({ ...route, icon }))).map((route) => {
                const current = route.isActive(pathname);
                return (
                  <Link key={route.href} href={route.href} aria-current={current ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                    <Icon name={route.icon} />
                    <span>{route.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className={styles.mobileMenuReading}>
              <span>Reference</span>
              {readingRoutes.map((route) => (
                <Link key={route.href} href={route.href} onClick={() => setMenuOpen(false)}>
                  <Icon name={route.icon} />
                  <span>{route.label}</span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
      <main className={styles.content}>{children}</main>
      <nav className={styles.mobileTabs} aria-label="Mobile product">
        {mobileRoutes.map((route) => {
          const current = route.isActive(pathname);
          return (
            <Link key={route.href} href={route.href} className={"primary" in route ? styles.mobileCreate : undefined} aria-current={current ? "page" : undefined} aria-label={route.label}>
              <Icon name={route.icon} />
              <span>{"primary" in route ? "Create" : route.label}</span>
            </Link>
          );
        })}
      </nav>
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
