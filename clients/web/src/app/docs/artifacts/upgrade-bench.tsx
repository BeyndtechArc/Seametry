"use client";

import { useState } from "react";
import styles from "./artifacts.module.css";

type Signer = "authority" | "anyone";

/**
 * The upgradeable loader's rule, which decides who can replace the Hall's
 * code: an upgrade must be signed by the upgrade authority, and once the
 * authority is set to none no upgrade is possible at all. The authority shown
 * is the one this page read from devnet; the attempt is a model of that rule,
 * not a transaction.
 */
export function UpgradeBench({ authority }: { authority: string | null | undefined }) {
  const [signer, setSigner] = useState<Signer>("anyone");
  const [thrownAway, setThrownAway] = useState(authority === null);
  const final = thrownAway || authority === null;
  const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

  const outcome = final
    ? { accepted: false, text: "Refused. The program has no upgrade authority, so the loader has nobody whose signature it would accept. Its code can no longer change." }
    : signer === "authority"
      ? { accepted: true, text: "Accepted. The loader replaces the program's code, and every Alloy on this Hall runs the new code from the next transaction. This is what the Key still allows on devnet." }
      : { accepted: false, text: "Refused. The loader requires the upgrade authority's signature; any other wallet's upgrade fails before it touches the program." };

  return (
    <figure className={styles.artifact} aria-label="Who can change the Hall">
      <div className={styles.controls}>
        <fieldset className={styles.toggles}>
          <legend>The upgrade is signed by</legend>
          <label>
            <input type="radio" name="upgrade-signer" checked={signer === "authority"} onChange={() => setSigner("authority")} />
            <span>The upgrade authority{authority ? ` (${short(authority)})` : ""}</span>
          </label>
          <label>
            <input type="radio" name="upgrade-signer" checked={signer === "anyone"} onChange={() => setSigner("anyone")} />
            <span>Any other wallet</span>
          </label>
        </fieldset>
        <fieldset className={styles.toggles}>
          <legend>The Key</legend>
          <label>
            <input type="checkbox" checked={final} disabled={authority === null} onChange={(event) => setThrownAway(event.target.checked)} />
            <span>Thrown away (authority set to none)</span>
          </label>
        </fieldset>
      </div>
      <pre className={styles.working} aria-label="The loader's decision">
        <code>{[
          `upgrade signed by   ${signer === "authority" ? "the upgrade authority" : "another wallet"}`,
          `upgrade authority   ${final ? "none" : authority ? short(authority) : "no observation"}`,
          `loader decision     ${outcome.accepted ? "ACCEPTED" : "REFUSED"}`,
        ].join("\n")}</code>
      </pre>
      <p className={styles.verdict} role="status">{outcome.text}</p>
      <figcaption>
        A model of the upgradeable loader&apos;s rule, not a transaction. The authority shown is the one this page read from devnet{authority === undefined ? "; devnet did not answer, so it is shown as no observation" : ""}.
      </figcaption>
    </figure>
  );
}
