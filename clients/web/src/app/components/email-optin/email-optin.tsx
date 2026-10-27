"use client";

import { useState } from "react";
import { Field, Key, QuietAction } from "@seametry/ui";
import { Callout } from "@seametry/ui/callout";
import { CONSENT_TEXT, CONSENT_VERSION, plainAddress, type OptInPage } from "@/lib/email-optin";
import { firstRefCode } from "@/lib/first-touch";
import styles from "./email-optin.module.css";

type Stage = { state: "writing" } | { state: "sending" } | { state: "kept"; unsubscribe: string } | { state: "refused"; reason: string };

/**
 * An optional address for two kinds of email, given only with the box
 * ticked. Nothing is sent from here; the answer carries the link that
 * withdraws the address, shown at once so it never depends on an email.
 */
export function EmailOptIn({ page, wallet, onDismiss, onKept }: { page: OptInPage; wallet?: string; onDismiss?: () => void; onKept?: () => void }) {
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [includeWallet, setIncludeWallet] = useState(false);
  const [stage, setStage] = useState<Stage>({ state: "writing" });
  const trimmed = address.trim();
  const disabledReason = !plainAddress(trimmed) ? "Enter one email address." : !consent ? "Tick the box to agree first." : undefined;

  async function keep() {
    if (disabledReason) return;
    setStage({ state: "sending" });
    try {
      const response = await fetch("/api/email-optin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: trimmed, consent, consentVersion: CONSENT_VERSION, page, refCode: firstRefCode(), ...(includeWallet && wallet ? { wallet } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; unsubscribe?: string };
      if (!response.ok || !body.unsubscribe) {
        setStage({ state: "refused", reason: body.error ?? "The address could not be kept just now. Nothing was kept." });
        return;
      }
      setStage({ state: "kept", unsubscribe: body.unsubscribe });
      onKept?.();
    } catch {
      setStage({ state: "refused", reason: "The address could not reach Seametry. Nothing was kept." });
    }
  }

  if (stage.state === "kept") {
    return (
      <Callout tone="done" title="Address kept" announce>
        <span className={styles.kept}>Two kinds of email may come to {trimmed}: the Hall&apos;s mainnet launch, and your trades settling. To stop and erase the address at any time, open <a href={stage.unsubscribe}>this unsubscribe link</a>. Every email carries the same kind of link.</span>
      </Callout>
    );
  }

  return (
    <section className={styles.optIn} aria-labelledby={`optin-${page}`}>
      <h2 id={`optin-${page}`}>Tell me when the Hall launches and when my trades settle</h2>
      <p className={styles.note}>Optional. No account is needed, and nothing is sent without the box below ticked.</p>
      <Field id={`optin-address-${page}`} label="Email address" type="email" autoComplete="email" value={address} onChange={(event) => setAddress(event.target.value)} />
      <label className={styles.consent}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{CONSENT_TEXT}</span>
      </label>
      {wallet ? (
        <label className={styles.consent}>
          <input type="checkbox" checked={includeWallet} onChange={(event) => setIncludeWallet(event.target.checked)} />
          <span>Keep my connected wallet {wallet.slice(0, 4)}…{wallet.slice(-4)} with the address, so a settlement email can name its trades.</span>
        </label>
      ) : null}
      {stage.state === "refused" ? <Callout tone="blocked" announce>{stage.reason}</Callout> : null}
      <div className={styles.tray}>
        <Key type="button" onClick={() => void keep()} disabled={Boolean(disabledReason)} disabledReason={disabledReason} busy={stage.state === "sending"} busyLabel="Keeping the address">Keep my address</Key>
        {onDismiss ? <QuietAction type="button" onClick={onDismiss}>Not now</QuietAction> : null}
      </div>
      <p className={styles.note}>The <a href="/privacy-policy">privacy policy</a> says what is kept and for how long.</p>
    </section>
  );
}
