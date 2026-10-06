"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { Digest, Key, QuietAction, StepRegister, TextAction, type RegisterStep } from "@seametry/ui";
import { ProcessDialog } from "@seametry/ui/modal-sheet";
import { buildFoundingTransaction, type FoundingIdentity } from "@/lib/compose/founding-transaction";
import type { PreparedFounding } from "@/lib/compose/founding-prepare";
import { metadataPath, metadataUri } from "@/lib/compose/identity";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "@/lib/hall/constants";
import { hallProgram } from "@/lib/hall/program";
import { foundingProblem, isDecline, type FoundingStage, type StageProblem } from "@/lib/compose/founding-problem";
import styles from "./compose.module.css";

type Run =
  | { state: "running"; stage: FoundingStage; note?: string }
  | { state: "stopped"; stage: FoundingStage; problem: StageProblem }
  | { state: "founded"; signature: string; prepared: PreparedFounding };

// A step is read from its title and mark; the one line beneath appears only
// while it runs, so nothing has to be read before the process makes sense.
const STAGES: { stage: FoundingStage; title: string; glyph: RegisterStep["glyph"]; note: string }[] = [
  { stage: "prepare", title: "Prepare the stand-ins", glyph: "hall", note: "Creating devnet stand-ins and funding your wallet" },
  { stage: "sign", title: "Sign in your wallet", glyph: "wallet", note: "Approve the founding in your wallet" },
  { stage: "confirm", title: "Confirm on devnet", glyph: "confirm", note: "Waiting for devnet" },
];

function registerSteps(run: Run | undefined): RegisterStep[] {
  // Assembling the transaction happens just before the wallet is asked, so it reads as part of signing.
  const shown = (stage: FoundingStage) => (stage === "build" ? "sign" : stage);
  const reached = run && run.state !== "founded" ? STAGES.findIndex((stage) => stage.stage === shown(run.stage)) : run ? STAGES.length : -1;
  return STAGES.map((stage, index) => {
    const step = { title: stage.title, glyph: stage.glyph };
    if (run?.state === "founded" || index < reached) return { ...step, state: "done" };
    if (index > reached || !run) return { ...step, state: "waiting" };
    if (run.state === "stopped") return { ...step, state: "stopped", problem: run.problem };
    return { ...step, state: "now", note: run.note ?? stage.note };
  });
}

/** Whether the metadata this name would be founded with is published, read once per name. */
function usePublished(name: string): boolean | undefined {
  const [answer, setAnswer] = useState<{ name: string; published: boolean }>();
  useEffect(() => {
    let current = true;
    fetch(metadataPath(name), { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => undefined) : undefined;
        if (current) setAnswer({ name, published: Boolean(body && body.name === name) });
      })
      .catch(() => current && setAnswer({ name, published: false }));
    return () => {
      current = false;
    };
  }, [name]);
  return answer?.name === name ? answer.published : undefined;
}

const LOOKUP_TABLE_ATTEMPTS = 5;
const SETTLE_POLL_MS = 1_500;
const SETTLE_LIMIT_MS = 60_000;

/**
 * On 6 October 2026 a founding that devnet simulated successfully failed in
 * Phantom with only "Unexpected error". The likeliest reading is that Phantom
 * resolves the lookup table through its own RPC and read a table confirmed
 * seconds earlier as missing; Phantom says nothing more specific, so that is
 * inferred. Waiting for finalization costs about fifteen seconds, so the
 * wallet is asked at once, and only a failure that is not a decline waits
 * for the table to finalize and asks once more.
 */
async function waitForSettledTable(connection: Connection, table: string) {
  const address = new PublicKey(table);
  const started = Date.now();
  while (!(await connection.getAddressLookupTable(address, { commitment: "finalized" })).value) {
    if (Date.now() - started > SETTLE_LIMIT_MS) {
      throw new Error(`The founding's lookup table ${table} was not finalized on devnet within ${SETTLE_LIMIT_MS / 1000} seconds.`);
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
}

/** A lookup table answers from the slot after it was extended, so the first read can be a moment early. */
async function buildWhenReady(connection: Connection, provider: AnchorProvider, prepared: PreparedFounding, identity: FoundingIdentity) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await buildFoundingTransaction(connection, hallProgram(provider, REGISTER_HALL_PROGRAM_ID), prepared, identity);
    } catch (error) {
      if (attempt >= LOOKUP_TABLE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

export function FoundingPanel({ legs, name, symbol }: { legs: { mint: string; atomsPerShare: bigint }[]; name: string; symbol: string }) {
  const { connected } = useWallet();
  const wallet = useAnchorWallet();
  const published = usePublished(name);
  const [run, setRun] = useState<Run>();
  const [open, setOpen] = useState(false);

  const found = async () => {
    if (!wallet) return;
    setOpen(true);
    let stage: FoundingStage = "prepare";
    try {
      setRun({ state: "running", stage });
      const response = await fetch("/api/compose/found", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sponsor: wallet.publicKey.toBase58(), name, symbol, legs: legs.map((leg) => ({ mint: leg.mint, atomsPerShare: leg.atomsPerShare.toString() })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const { prepared, identity } = body as { prepared: PreparedFounding; identity: FoundingIdentity };

      stage = "build";
      setRun({ state: "running", stage });
      const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
      const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
      let transaction = await buildWhenReady(connection, provider, prepared, identity);

      stage = "sign";
      setRun({ state: "running", stage });
      let signed: VersionedTransaction;
      try {
        signed = await wallet.signTransaction(transaction);
      } catch (first) {
        if (isDecline(first)) throw first;
        stage = "build";
        setRun({ state: "running", stage, note: "Your wallet could not read the founding yet; letting devnet settle it" });
        await waitForSettledTable(connection, prepared.lookupTable);
        transaction = await buildWhenReady(connection, provider, prepared, identity);
        stage = "sign";
        setRun({ state: "running", stage });
        signed = await wallet.signTransaction(transaction);
      }

      stage = "confirm";
      setRun({ state: "running", stage });
      const signature = await connection.sendRawTransaction(signed.serialize());
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(`The Hall refused the founding: ${JSON.stringify(confirmation.value.err)} (transaction ${signature})`);
      setRun({ state: "founded", signature, prepared });
    } catch (error) {
      setRun({ state: "stopped", stage, problem: foundingProblem(stage, error) });
    }
  };

  const running = run?.state === "running";
  const reason = !connected
    ? "Log in with a devnet wallet: it signs as the sponsor."
    : published === false
      ? `No metadata is published at ${metadataPath(name)}, so this name has no URI to found with.`
      : undefined;

  const sheet = (
    <ProcessDialog
      open={open}
      onClose={() => setOpen(false)}
      title={run?.state === "founded" ? `${name} is founded` : `Founding ${name}`}
      register="Devnet"
      closeLabel="Close founding"
      footer={
        run?.state === "stopped" ? (
          <QuietAction type="button" onClick={() => void found()}>Try again</QuietAction>
        ) : run?.state === "founded" ? (
          <TextAction href={`/app/alloys/${run.prepared.alloy}`}>Open the Alloy</TextAction>
        ) : undefined
      }
    >
      <StepRegister label={`Founding ${name}`} steps={registerSteps(run)} />
    </ProcessDialog>
  );

  if (run?.state === "founded") {
    return (
      <section className={styles.founding} aria-labelledby="founded-heading" data-testid="founding">
        <span className={styles.label}>Founded on devnet</span>
        <h3 id="founded-heading">{name} is founded</h3>
        <Digest value={run.prepared.alloy} />
        <p className={styles.note}>Its Formula, name, symbol and URI are fixed. One share is locked as the genesis, forever.</p>
        <TextAction href={`/app/alloys/${run.prepared.alloy}`}>Open the Alloy record</TextAction>
        <TextAction href={`https://explorer.solana.com/tx/${run.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Open the founding on Solana</TextAction>
        {sheet}
      </section>
    );
  }

  return (
    <section className={styles.founding} aria-labelledby="found-heading" data-testid="founding">
      <span className={styles.label}>Found on devnet</span>
      <h3 id="found-heading">Found {name}</h3>
      <dl className={styles.terms}>
        <div><dt>Hall</dt><dd>The register&apos;s devnet Hall. Key still in hand.</dd></div>
        <div><dt>Sponsor</dt><dd>Your connected wallet, which signs</dd></div>
        <div><dt>Constituents</dt><dd>Devnet stand-ins carrying each stock&apos;s token settings</dd></div>
        <div><dt>Genesis</dt><dd>One share, locked forever</dd></div>
        <div><dt>URI</dt><dd>{metadataUri(name)}</dd></div>
      </dl>
      <p className={styles.note}>The Formula, name, symbol and URI cannot change after this.</p>
      <Key
        type="button"
        onClick={() => void found()}
        disabled={Boolean(reason) || published === undefined}
        disabledReason={reason}
        busy={running}
        busyLabel="Founding"
      >
        Found on devnet
      </Key>
      {run && !open ? <QuietAction type="button" onClick={() => setOpen(true)}>{run.state === "stopped" ? "Read why the founding stopped" : "Show the founding's progress"}</QuietAction> : null}
      {sheet}
    </section>
  );
}
