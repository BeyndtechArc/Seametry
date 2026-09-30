import type { ReactNode } from "react";
import Link from "next/link";
import { Digest, RegisterFooter, RouteAction, Rule } from "@seametry/ui";
import { ThemeControl } from "@seametry/ui/theme-control";
import { publicIncident, publicIncidentAge } from "@/lib/public-evidence";
import { BrandMark } from "./brand-mark";
import styles from "./site.module.css";

type PublicDestination = "home" | "how" | "key" | "sign-in";

// Reading pages only (components.md, House rail). The product lives in the
// App shell at /app, reached by the one "Open app" action.
const primaryLinks = [
  { id: "how", label: "How it works", href: "/how-it-works" },
  { id: "key", label: "The Key", href: "/the-key" },
] as const;

export function HouseRail({ current }: { current?: PublicDestination }) {
  return (
    <header className={styles.houseRail}>
      <BrandMark />
      <nav className={styles.primaryNav} aria-label="Primary">
        {primaryLinks.map((link) => (
          <Link key={link.id} href={link.href} aria-current={current === link.id ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
      </nav>
      <div className={styles.railTools}>
        <RouteAction href="/app">Open app</RouteAction>
        <ThemeControl />
      </div>
    </header>
  );
}

export function OpenAPField() {
  return (
    <figure className={styles.apField} data-testid="open-ap-field">
      <header>
        <span>Open participant loop</span>
        <span>No permission list</span>
      </header>
      <div className={styles.apMechanism}>
        <div className={`${styles.apNode} ${styles.apWallet}`}>
          <span>Any wallet</span>
          <small>Holds the Formula</small>
        </div>
        <div className={`${styles.apPath} ${styles.apStrike}`}>
          <b>Strike</b>
          <span>Deposit constituents</span>
        </div>
        <div className={styles.apCore}>
          <span>Alloy</span>
          <b>Share</b>
          <small>Fixed Formula</small>
        </div>
        <div className={`${styles.apPath} ${styles.apMelt}`}>
          <b>Melt</b>
          <span>Destroy shares</span>
        </div>
        <div className={`${styles.apNode} ${styles.apClaims}`}>
          <span>Claims</span>
          <small>One per constituent</small>
        </div>
      </div>
      <figcaption>The Hall moves quantities. No oracle, quote or NAV enters Strike or Melt.</figcaption>
    </figure>
  );
}

export function PublicShell({
  current,
  children,
}: {
  current?: PublicDestination;
  children: ReactNode;
}) {
  return (
    <div className={styles.site}>
      <HouseRail current={current} />
      <main>{children}</main>
      <RegisterFooter
        groups={[
          {
            title: "Product",
            links: [
              { label: "How it works", href: "/how-it-works" },
              { label: "Open the app", href: "/app" },
              { label: "Allocation", href: "/app/allocation" },
              { label: "Hall demonstration", href: "/app/hall" },
            ],
          },
          {
            title: "The house",
            links: [
              { label: "The Key", href: "/the-key" },
              { label: "Pattern Register", href: "/patterns" },
            ],
          },
          {
            title: "Developers",
            links: [
              { label: "Source", href: "https://github.com/BeyndtechArc/Seametry" },
              { label: "API contract", href: "https://github.com/BeyndtechArc/Seametry/blob/main/contracts/openapi/openapi.yaml" },
            ],
          },
          {
            title: "Access",
            links: [{ label: "Sign in", href: "/sign-in" }],
          },
        ]}
        note="Seametry is operated by Beyndtech Arc from Port Harcourt. Public evidence requires no account."
      />
    </div>
  );
}

export function SectionHeading({
  index,
  title,
  question,
}: {
  index: string;
  title: string;
  question: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <span>{index}</span>
      <h2>{title}</h2>
      <p>{question}</p>
    </header>
  );
}

export function IncidentLedger() {
  const age = publicIncidentAge();

  return (
    <article className={styles.incidentLedger} aria-labelledby="incident-title">
      <header className={styles.incidentHeader}>
        <div>
          <span>Recorded on Solana devnet</span>
          <h2 id="incident-title">A melt survives the freeze.</h2>
        </div>
        <div className={styles.incidentSource}>
          <span>Observed {age}</span>
          <Digest value={publicIncident.sourceCommit} />
        </div>
      </header>
      <ol className={styles.incidentSteps}>
        {publicIncident.steps.map((step, index) => (
          <li key={`${index}-${step.actor}-${step.action}`}>
            <span className={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
            <b>{step.actor}</b>
            <p>{step.action}</p>
            <div className={styles.stepResult}>
              <span>{step.result === "ok" ? "Recorded" : "Refused"}</span>
              {step.reason ? <code>{step.reason}</code> : null}
              {step.signature ? <Digest value={step.signature} /> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className={styles.incidentBoundary}>
        <p>{publicIncident.boundary}</p>
        <Rule label={publicIncident.source} />
      </div>
    </article>
  );
}
