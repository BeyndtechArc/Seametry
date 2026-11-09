"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@seametry/ui/icons";
import { ThemeControl } from "@seametry/ui/theme-control";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "../../brand-mark";
import { adminGroups } from "./routes";
import styles from "./admin-shell.module.css";

/** components.md, Admin shell. */
export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string>();

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.head}>
          <BrandMark href="/admin" compactOnNarrow />
          {/* One list for every width. On a phone it folds behind this
              button, which the stylesheet hides where the rail stays open. */}
          <button type="button" className={styles.toggle} aria-expanded={open} aria-controls="admin-pages" onClick={() => setOpen((was) => !was)}>
            <span>Admin pages</span>
            <Icon name={open ? "close" : "next"} />
          </button>
        </div>
        <div id="admin-pages" className={styles.holder} data-open={open || undefined}>
          <nav aria-label="Admin">
            {adminGroups.map((group) => (
              <div key={group.label} className={styles.group}>
                <p className={styles.groupLabel}>{group.label}</p>
                <ul>
                  {group.routes.map((route) => (
                    <li key={route.href}>
                      <Link href={route.href} aria-current={pathname === route.href ? "page" : undefined} onClick={() => setOpen(false)}>
                        {route.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className={styles.account}>
            <p className={styles.email}>{email}</p>
            <Link href="/">Open the site</Link>
            <Link href="/app">Open the app</Link>
            <button type="button" disabled={leaving} onClick={async () => {
              setLeaving(true);
              const result = await authClient.signOut();
              if (result.error) {
                setProblem(result.error.message ?? "This session could not be ended. Try again.");
                setLeaving(false);
                return;
              }
              router.push("/");
            }}>Sign out</button>
            {problem ? <p role="alert" className={styles.problem}>{problem}</p> : null}
            <ThemeControl />
          </div>
        </div>
      </aside>
      <main className={styles.page}>{children}</main>
    </div>
  );
}
