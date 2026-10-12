"use client";

import type { ReactNode } from "react";
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
          </div>
        </div>
      </header>
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
