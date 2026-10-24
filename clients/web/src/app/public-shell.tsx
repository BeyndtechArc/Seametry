import type { ReactNode } from "react";
import { Digest, RegisterFooter, Rule } from "@seametry/ui";
import { publicIncident, publicIncidentAge } from "@/lib/public-evidence";
import { HouseRail, type PublicDestination } from "./components/lens/house-rail";
import styles from "./site.module.css";

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
              { label: "Docs", href: "/docs" },
              { label: "How it works", href: "/docs/how-it-works" },
              { label: "Thesis", href: "/thesis" },
              { label: "Open the app", href: "/app" },
              { label: "Allocation", href: "/app/allocation" },
              { label: "Alloys", href: "/app/alloys" },
            ],
          },
          {
            title: "The house",
            links: [
              { label: "The Key", href: "/docs/the-key" },
              { label: "The exit", href: "/docs/papers/the-exit" },
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
            links: [
              { label: "Sign in", href: "/sign-in" },
              { label: "Terms", href: "/terms" },
              { label: "Privacy policy", href: "/privacy-policy" },
            ],
          },
          {
            title: "Contact",
            links: [
              { label: "Send feedback", href: "/feedback" },
              { label: "seametry@beyndtech.com", href: "mailto:seametry@beyndtech.com" },
            ],
          },
        ]}
        accounts={[{ label: "Seametry on X", href: "https://x.com/seametry_", icon: "x-account" }]}
        note="Seametry is operated by Beyndtech Arc from Port Harcourt. Public evidence requires no account."
      />
    </div>
  );
}

/**
 * One title that is its own answer, with no subtitle under it (Storm, 24
 * October 2026): the statement, then its qualifying clause a step quieter,
 * two lines at most. The number is a mark of place, not something to read.
 */
export function SectionHeading({
  index,
  title: [statement, qualifier],
}: {
  index: string;
  title: readonly [string, string];
}) {
  return (
    <header className={styles.sectionHeading}>
      <h2>
        {statement} <span>{qualifier}</span>
      </h2>
      <span aria-hidden="true">{index}</span>
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
