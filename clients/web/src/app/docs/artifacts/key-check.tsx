import { readHallAuthority } from "@/lib/hall/authority";
import { UpgradeBench } from "./upgrade-bench";
import styles from "./artifacts.module.css";

const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";

/**
 * The fields `solana program show` reports for the register Hall, read live
 * by this page from the same loader accounts the command reads. Only fields
 * the page itself read are printed; the command shows more.
 */
export async function KeyCheck() {
  const observed = await readHallAuthority();
  const lines = observed.state === "observed"
    ? [
        `$ solana program show ${observed.program} --url devnet`,
        `Program Id: ${observed.program}`,
        `Owner: ${LOADER}`,
        `ProgramData Address: ${observed.programData}`,
        `Authority: ${observed.authority ?? "none"}`,
        `Last Deployed In Slot: ${observed.deployedSlot.toString()}`,
      ]
    : [`$ solana program show ${observed.program} --url devnet`, `(no observation: ${observed.reason})`];
  return (
    <figure className={styles.artifact} aria-label="Check the Key yourself">
      <pre className={styles.working} aria-label="What the command reports">
        <code>{lines.join("\n")}</code>
      </pre>
      <figcaption>
        {observed.state === "observed"
          ? `Read live by this page at slot ${observed.slot.toLocaleString("en-GB")}, ${new Date(observed.observedAt).toUTCString()}, from the ${observed.source}. Run the command with the Solana CLI and compare.`
          : `No observation just now from the ${observed.source}. The command reads the same accounts.`}
      </figcaption>
    </figure>
  );
}

/** The upgrade bench, fed by the authority this page observed. */
export async function KeyUpgrade() {
  const observed = await readHallAuthority();
  return <UpgradeBench authority={observed.state === "observed" ? observed.authority : undefined} />;
}
