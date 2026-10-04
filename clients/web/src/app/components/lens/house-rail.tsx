"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RouteAction } from "@seametry/ui";
import { ThemeControl } from "@seametry/ui/theme-control";
import { BrandMark } from "../../brand-mark";
import styles from "./house-rail.module.css";

export type PublicDestination = "home" | "how" | "key" | "sign-in";

const primaryLinks: Array<{ id: PublicDestination; label: string; href: string }> = [
  { id: "home", label: "Home", href: "/" },
  { id: "how", label: "How it works", href: "/how-it-works" },
  { id: "key", label: "The Key", href: "/the-key" },
];

export function HouseRail({ current }: { current?: PublicDestination }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className={styles.railWrap}>
      <header className={styles.houseRail} data-scrolled={scrolled || undefined}>
        <BrandMark compactOnNarrow />
        <nav className={styles.primaryNav} aria-label="Primary">
          {primaryLinks.map((link) => (
            <Link key={link.id} href={link.href} aria-current={current === link.id ? "page" : undefined}>
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.railTools}>
          <span className={styles.appWide}><RouteAction href="/app">Open app</RouteAction></span>
          <span className={styles.appNarrow}><RouteAction href="/app">App</RouteAction></span>
          <ThemeControl />
        </div>
        <button
          className={styles.menuControl}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="public-mobile-navigation"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h11" />}
          </svg>
        </button>
        {menuOpen ? (
          <nav id="public-mobile-navigation" className={styles.mobileRegister} aria-label="Mobile primary">
            {primaryLinks.map((link, index) => (
              <Link key={link.id} href={link.href} aria-current={current === link.id ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                <small>0{index + 1}</small>
                <span>{link.label}</span>
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
    </div>
  );
}
