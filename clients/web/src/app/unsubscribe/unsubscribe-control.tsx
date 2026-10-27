"use client";

import { useState } from "react";
import { Key } from "@seametry/ui";
import { Callout } from "@seametry/ui/callout";

type Stage = { state: "ready" } | { state: "sending" } | { state: "done" } | { state: "refused"; reason: string };

// A button, not an automatic request on load: mail scanners open links, and
// one that unsubscribed by opening would erase addresses nobody chose to.
export function UnsubscribeControl({ token }: { token?: string }) {
  const [stage, setStage] = useState<Stage>({ state: "ready" });
  if (!token) return <Callout tone="blocked" title="This link carries no token">Open the unsubscribe link from the email again, or write to <a href="mailto:seametry@beyndtech.com">seametry@beyndtech.com</a> and the address will be removed by hand.</Callout>;
  if (stage.state === "done") return <Callout tone="done" title="Unsubscribed" announce>The address is erased. No more email will come from this opt-in.</Callout>;

  async function withdraw() {
    setStage({ state: "sending" });
    try {
      const response = await fetch("/api/email-optin/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (response.ok) {
        setStage({ state: "done" });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStage({ state: "refused", reason: body.error ?? `The request answered ${response.status}. Write to seametry@beyndtech.com and the address will be removed by hand.` });
    } catch {
      setStage({ state: "refused", reason: "Seametry could not be reached. Try again, or write to seametry@beyndtech.com." });
    }
  }

  return (
    <>
      {stage.state === "refused" ? <Callout tone="blocked" announce>{stage.reason}</Callout> : null}
      <div>
        <Key type="button" onClick={() => void withdraw()} busy={stage.state === "sending"} busyLabel="Unsubscribing">Unsubscribe and erase my address</Key>
      </div>
    </>
  );
}
