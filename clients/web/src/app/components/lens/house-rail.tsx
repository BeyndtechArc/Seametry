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

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <div className={styles.railWrap}>
      <header className={styles.houseRail} data-scrolled={scrolled || undefined}>
        <BrandMark />
        <nav className={styles.primaryNav} aria-label="Primary">
          {primaryLinks.map((link) => (
            <Link key={link.id} href={link.href} aria-current={current === link.id ? "page" : undefined}>
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <div className={styles.railTools}>
          <RouteAction href="/app">Open app</RouteAction>
          <ThemeControl />
        </div>
      </header>
    </div>
  );
}
