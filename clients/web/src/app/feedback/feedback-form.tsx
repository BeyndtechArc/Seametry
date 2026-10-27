"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Field, FieldArea, Key, QuietAction } from "@seametry/ui";
import { Callout } from "@seametry/ui/callout";
import { EmailOptIn } from "../components/email-optin/email-optin";
import styles from "./feedback.module.css";

const LIMIT = 4000;

type Stage = { state: "writing" } | { state: "sending" } | { state: "sent"; replyTo: string } | { state: "refused"; reason: string };

/** The page the visitor came from, when it was this site: context for the team, never another site's address. */
function previousPage(): string | undefined {
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin ? referrer.pathname.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

export function FeedbackForm() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [includeWallet, setIncludeWallet] = useState(false);
  const [stage, setStage] = useState<Stage>({ state: "writing" });

  const trimmed = message.trim();
  const tooLong = trimmed.length > LIMIT;
  const disabledReason = !trimmed ? "Write what happened or what should change." : tooLong ? `Shorten the message to ${LIMIT.toLocaleString("en-US")} characters.` : undefined;

  async function send() {
    if (disabledReason) return;
    setStage({ state: "sending" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, replyTo: replyTo.trim(), page: previousPage(), ...(includeWallet && wallet ? { wallet } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStage({ state: "refused", reason: body.error ?? "Feedback could not be sent just now. Email seametry@beyndtech.com instead." });
        return;
      }
      setStage({ state: "sent", replyTo: replyTo.trim() });
      setMessage("");
    } catch {
      setStage({ state: "refused", reason: "Feedback could not reach Seametry. Email seametry@beyndtech.com instead." });
    }
  }

  if (stage.state === "sent") {
    return (
      <section className={styles.form}>
        <Callout tone="done" title="Sent to the team" announce action={<QuietAction type="button" onClick={() => setStage({ state: "writing" })}>Send more</QuietAction>}>
          {stage.replyTo ? `Thank you. A reply comes to ${stage.replyTo}.` : "Thank you. You gave no email address, so no reply will come."}
        </Callout>
      </section>
    );
  }

  return (
    <>
      <section className={styles.form}>
        <FieldArea
          id="feedback-message"
          label="What happened, or what should change"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={LIMIT + 500}
          invalid={tooLong}
          message={tooLong ? `${trimmed.length.toLocaleString("en-US")} characters; at most ${LIMIT.toLocaleString("en-US")} are kept.` : `Up to ${LIMIT.toLocaleString("en-US")} characters.`}
        />
        <Field
          id="feedback-reply"
          label="Your email, for a reply"
          type="email"
          autoComplete="email"
          value={replyTo}
          onChange={(event) => setReplyTo(event.target.value)}
          message="Optional. Leave it empty and no reply will come."
        />
        {wallet ? (
          <div className={styles.wallet}>
            <p>{includeWallet ? `Your connected wallet ${wallet.slice(0, 4)}…${wallet.slice(-4)} goes with this message, so the team can look at what it did.` : "Your connected wallet is left out of this message."}</p>
            <QuietAction type="button" onClick={() => setIncludeWallet(!includeWallet)}>{includeWallet ? "Leave my wallet out" : "Include my wallet"}</QuietAction>
          </div>
        ) : null}
        {stage.state === "refused" ? <Callout tone="blocked" announce>{stage.reason}</Callout> : null}
        <div className={styles.tray}>
          <Key type="button" onClick={() => void send()} disabled={Boolean(disabledReason)} disabledReason={disabledReason} busy={stage.state === "sending"} busyLabel="Sending">
            Send feedback
          </Key>
        </div>
        <p className={styles.elsewhere}>
          Or write to <a href="mailto:seametry@beyndtech.com">seametry@beyndtech.com</a>, or reach Seametry on <a href="https://x.com/seametry_">X</a>.
        </p>
      </section>
      <section className={styles.form}>
        <EmailOptIn page="feedback" wallet={wallet} />
      </section>
    </>
  );
}
