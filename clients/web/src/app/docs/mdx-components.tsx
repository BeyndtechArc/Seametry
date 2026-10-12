import Link from "next/link";
import type { ComponentProps } from "react";
import { ClaimLine, Digest, RouteAction, Stamp, TextAction } from "@seametry/ui";
import { REGISTER_HALL_PROGRAM_ID } from "@/lib/hall/constants";
import { readHallAuthority } from "@/lib/hall/authority";
import recipeVectors from "../../../../../shared/spec/recipe/vectors.json";
import { FreezeBench } from "./artifacts/freeze-bench";
import { GradeTable, InstrumentExplorer, PowerCounts } from "./artifacts/evidence";
import { KeyCheck, KeyUpgrade } from "./artifacts/key-check";
import { LoopDiagram } from "./artifacts/loop-diagram";
import { VersionSteps } from "./artifacts/version-steps";
import { StrikeMeltBench } from "./artifacts/strike-melt-bench";
import styles from "./docs.module.css";

// The bench starts where the specification's rounding vector starts, so the
// first numbers a reader moves are the ones the Hall is tested against.
const roundingVector = recipeVectors.scenarios.find((scenario) => scenario.name === "strike and melt with rounding")!;

function StrikeMelt() {
  const [initial] = roundingVector.steps;
  return <StrikeMeltBench scale={roundingVector.scale} initial={{ ledger: initial.ledger, unclaimed: initial.unclaimed, supply: initial.supply }} />;
}

// The register Hall, the one the product reads. The page this replaced showed
// the scratch Hall from the demo transcript beside a link to the register
// Hall; one constant now feeds both, so they cannot name two programs again.
const hallProgram = REGISTER_HALL_PROGRAM_ID.toBase58();

/**
 * The Key's state as devnet reports it at request time: the authority the
 * loader holds, or none once the program is final, or no observation with the
 * reason. The page says what the chain says now, never what it said when the
 * page was written.
 */
async function KeyState() {
  const observed = await readHallAuthority();
  const lead =
    observed.state === "unavailable"
      ? "The Key's state could not be read just now."
      : observed.authority
        ? "The Key is still in hand."
        : "No Key remains: the program is final.";
  return (
    <div className={styles.keyState}>
      <p className={styles.keyLead}>{lead}</p>
      {observed.state === "unavailable" ? (
        <Stamp kind="warn" reason={`No observation. ${observed.reason}`} />
      ) : observed.authority ? (
        <Stamp kind="warn" reason="Devnet Hall. Key still in hand." />
      ) : (
        <Stamp kind="allow" reason="No upgrade authority. The program cannot be changed." />
      )}
      <dl className={styles.facts}>
        <div><dt>Cluster</dt><dd>Solana devnet</dd></div>
        <div><dt>Program</dt><dd><Digest value={hallProgram} /></dd></div>
        <div>
          <dt>Upgrade authority</dt>
          <dd>{observed.state === "unavailable" ? "No observation" : observed.authority ? <Digest value={observed.authority} /> : "None"}</dd>
        </div>
      </dl>
      <p className={styles.provenance}>
        {observed.state === "observed"
          ? `Observed at slot ${observed.slot.toLocaleString("en-GB")}, ${new Date(observed.observedAt).toUTCString()}, from the ${observed.source}.`
          : `Source: the ${observed.source}. Read again on the next visit.`}
      </p>
    </div>
  );
}

function InspectHallProgram() {
  return <RouteAction href={`https://explorer.solana.com/address/${hallProgram}?cluster=devnet`}>Inspect the program</RouteAction>;
}

// MDX links inside the app resolve through next/link so a page change keeps
// the nonce-bearing document it was served in; anything else opens apart.
export const mdxComponents = {
  a: ({ href = "", ...props }: ComponentProps<"a">) =>
    href.startsWith("/") || href.startsWith("#") ? <Link href={href} {...props} /> : <a href={href} rel="noreferrer" target="_blank" {...props} />,
  ClaimLine,
  RouteAction,
  Stamp,
  TextAction,
  KeyState,
  InspectHallProgram,
  StrikeMelt,
  FreezeBench,
  GradeTable,
  PowerCounts,
  InstrumentExplorer,
  LoopDiagram,
  KeyCheck,
  KeyUpgrade,
  VersionSteps,
};
