"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { Field, Key, QuietAction, StepRegister, type RegisterStep } from "@seametry/ui";
import type { IconName } from "@seametry/ui/icons";
import { ProcessDialog } from "@seametry/ui/modal-sheet";
import { buildDelivery, buildMelt, buildStrike, readClaim, type ClaimLeg } from "@/lib/alloys/hall-transactions";
import { formatAmount, parseAmount } from "@/lib/amount";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID, SHARE_DECIMALS } from "@/lib/hall/constants";
import { ownerTokenAccount } from "@/lib/hall/pda";
import { hallProgram } from "@/lib/hall/program";
import { awaitLanding } from "@/lib/landing";
import { DELIVERY, MELT, STRIKE, requestProblem, type RequestStage, type RequestSubject, type StageProblem } from "@/lib/request-problem";
import type { Alloy } from "@/lib/terminal-contract";
import styles from "./desk.module.css";

/** A step names the request it belongs to, so a stop is worded for that request. */
type Step = { title: string; glyph: IconName; note: string; subject: RequestSubject };
type Run = {
  title: string;
  steps: Step[];
  /** The step being worked; every earlier one is done. */
  at: number;
  state: "running" | "stopped" | "done";
  problem?: StageProblem;
};

const PREPARE: Step = { title: "Prepare the stand-ins", glyph: "hall", note: "Minting the devnet stand-ins this Strike takes into your wallet", subject: STRIKE };
const signStep = (subject: RequestSubject): Step => ({ title: `Sign the ${subject.noun} in your wallet`, glyph: "wallet", note: `Approve the ${subject.noun} in your wallet`, subject });
const confirmStep = (subject: RequestSubject): Step => ({ title: `Confirm the ${subject.noun} on devnet`, glyph: "confirm", note: "Waiting for devnet", subject });

function registerSteps(run: Run): RegisterStep[] {
  return run.steps.map((step, index) => {
    const base = { title: step.title, glyph: step.glyph };
    if (run.state === "done" || index < run.at) return { ...base, state: "done" };
    if (index > run.at) return { ...base, state: "waiting" };
    if (run.state === "stopped") return { ...base, state: "stopped", problem: run.problem };
    return { ...base, state: "now", note: step.note };
  });
}

/**
 * Strike and Melt on a register Alloy, signed by the visitor's own wallet.
 * A Strike on devnet first has Seametry mint the stand-ins it takes; a Melt
 * credits a Claim, then delivers every leg not held back in one signature.
 * A held-back leg stays in the Claim, deliverable once the issuer releases it.
 */
export function AlloyActions({ alloy, onChanged }: { alloy: Alloy; onChanged: () => void }) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();
  const connection = useMemo(() => new Connection(DEVNET_RPC_ENDPOINT, "confirmed"), []);
  const program = useMemo(
    () => (anchorWallet ? hallProgram(new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" }), REGISTER_HALL_PROGRAM_ID) : undefined),
    [anchorWallet, connection],
  );
  const alloyKey = useMemo(() => new PublicKey(alloy.address), [alloy.address]);

  const [shares, setShares] = useState<bigint>();
  const [claim, setClaim] = useState<ClaimLeg[]>([]);
  const [unreadable, setUnreadable] = useState<string>();
  const [reads, setReads] = useState(0);
  const [strikeTyped, setStrikeTyped] = useState("1");
  const [meltTyped, setMeltTyped] = useState("1");
  const [run, setRun] = useState<Run>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!publicKey || !program) return;
    let current = true;
    (async () => {
      let account: PublicKey;
      try {
        account = ownerTokenAccount(publicKey, new PublicKey(alloy.share_mint));
      } catch {
        if (current) setUnreadable(`This Alloy's share mint ${JSON.stringify(alloy.share_mint)} is not a Solana address, so your shares cannot be read.`);
        return;
      }
      // No token account and no Claim both read as none; a failed read too,
      // since either way there is nothing this wallet can Melt or deliver yet.
      const balance = await connection.getTokenAccountBalance(account, "confirmed").then((answer) => BigInt(answer.value.amount)).catch(() => 0n);
      const legs = await readClaim(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey).catch(() => []);
      if (current) {
        setShares(balance);
        setClaim(legs);
      }
    })();
    return () => {
      current = false;
    };
  }, [publicKey, program, connection, alloy.share_mint, alloyKey, reads]);

  const deliverable = claim.filter((leg) => !alloy.legs[leg.index]?.held_back);
  const strikeAmount = parseAmount(strikeTyped, SHARE_DECIMALS);
  const meltAmount = parseAmount(meltTyped, SHARE_DECIMALS);
  const busy = run?.state === "running";

  /**
   * Runs one request through its steps. `sign(at, transaction)` puts the
   * transaction at sign step `at`, moves to the confirm step after it once
   * the wallet sends, and waits for devnet; every other move is `advance`.
   */
  const execute = useCallback(
    async (
      title: string,
      steps: Step[],
      body: (advance: (at: number, stage: RequestStage) => void, sign: (at: number, transaction: VersionedTransaction) => Promise<string>) => Promise<void>,
    ) => {
      let at = 0;
      let stage: RequestStage = "prepare";
      const advance = (next: number, nextStage: RequestStage) => {
        at = next;
        stage = nextStage;
        setRun({ title, steps, at, state: "running" });
      };
      const sign = async (step: number, transaction: VersionedTransaction) => {
        advance(step, "sign");
        const signature = await sendTransaction(transaction, connection);
        advance(step + 1, "confirm");
        await awaitLanding(connection, signature, transaction.message.recentBlockhash);
        return signature;
      };
      setOpen(true);
      advance(0, "prepare");
      try {
        await body(advance, sign);
        setRun({ title, steps, at: steps.length, state: "done" });
      } catch (error) {
        setRun({ title, steps, at, state: "stopped", problem: requestProblem(steps[at].subject, stage, error) });
      } finally {
        setReads((count) => count + 1);
        onChanged();
      }
    },
    [connection, sendTransaction, onChanged],
  );

  const strike = (atoms: bigint) =>
    execute(`Strike ${formatAmount(atoms, SHARE_DECIMALS)} shares`, [PREPARE, signStep(STRIKE), confirmStep(STRIKE)], async (advance, sign) => {
      if (!publicKey || !program) return;
      const response = await fetch("/api/alloys/strike", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alloy: alloy.address, striker: publicKey.toBase58(), shares: atoms.toString() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      advance(1, "build");
      await sign(1, await buildStrike(connection, program, alloyKey, publicKey, atoms));
    });

  const melt = (atoms: bigint) =>
    execute(`Melt ${formatAmount(atoms, SHARE_DECIMALS)} shares`, [signStep(MELT), confirmStep(MELT), signStep(DELIVERY), confirmStep(DELIVERY)], async (advance, sign) => {
      if (!publicKey || !program) return;
      advance(0, "build");
      await sign(0, await buildMelt(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey, atoms));
      advance(2, "build");
      const legs = (await readClaim(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey)).filter((leg) => !alloy.legs[leg.index]?.held_back);
      for (const transaction of await buildDelivery(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey, legs)) {
        await sign(2, transaction);
      }
    });

  const deliver = () =>
    execute("Deliver your Claim", [signStep(DELIVERY), confirmStep(DELIVERY)], async (advance, sign) => {
      if (!publicKey || !program) return;
      advance(0, "build");
      for (const transaction of await buildDelivery(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey, deliverable)) {
        await sign(0, transaction);
      }
    });

  const notConnected = connected ? undefined : "Log in with a devnet wallet: it signs the Strike or Melt.";
  const meltReason =
    notConnected ??
    unreadable ??
    (shares === undefined
      ? "Reading your shares of this Alloy."
      : shares === 0n
        ? "You hold no shares of this Alloy to Melt. Strike some first; the founder's genesis share is locked forever."
        : "atoms" in meltAmount && meltAmount.atoms > shares
          ? `You hold ${formatAmount(shares, SHARE_DECIMALS)} shares.`
          : undefined);

  return (
    <section className={styles.alloyActions} aria-label="Strike or Melt">
      <div className={styles.actionCard}>
        <h3>Strike</h3>
        <p>Deposit the stocks one share holds and receive new shares. On devnet, Seametry first mints the stand-ins into your wallet.</p>
        <Field id="strike-shares" label="Shares to Strike" inputMode="decimal" value={strikeTyped} onChange={(event) => setStrikeTyped(event.target.value)} message={"refused" in strikeAmount ? strikeAmount.refused : undefined} invalid={"refused" in strikeAmount} />
        <Key type="button" disabled={Boolean(notConnected) || !("atoms" in strikeAmount) || strikeAmount.atoms === 0n} disabledReason={notConnected} busy={busy} busyLabel="Working" onClick={() => "atoms" in strikeAmount && void strike(strikeAmount.atoms)}>
          Strike shares
        </Key>
      </div>
      <div className={styles.actionCard}>
        <h3>Melt</h3>
        <p>{shares !== undefined && connected ? `You hold ${formatAmount(shares, SHARE_DECIMALS)} shares. ` : ""}Return shares and take every stock back. A stock its issuer holds back stays in your Claim.</p>
        <Field id="melt-shares" label="Shares to Melt" inputMode="decimal" value={meltTyped} onChange={(event) => setMeltTyped(event.target.value)} message={"refused" in meltAmount ? meltAmount.refused : undefined} invalid={"refused" in meltAmount} />
        <Key type="button" disabled={Boolean(meltReason) || !("atoms" in meltAmount) || meltAmount.atoms === 0n} disabledReason={meltReason} busy={busy} busyLabel="Working" onClick={() => "atoms" in meltAmount && void melt(meltAmount.atoms)}>
          Melt shares
        </Key>
        {deliverable.length > 0 ? (
          <QuietAction type="button" disabled={busy} onClick={() => void deliver()}>
            Deliver your Claim ({deliverable.length} {deliverable.length === 1 ? "stock" : "stocks"})
          </QuietAction>
        ) : null}
      </div>
      {run && !open ? (
        <QuietAction type="button" onClick={() => setOpen(true)}>{run.state === "stopped" ? `Read why the ${run.steps[run.at].subject.noun} stopped` : `Show the progress of: ${run.title}`}</QuietAction>
      ) : null}
      {run ? (
        <ProcessDialog
          open={open}
          onClose={() => setOpen(false)}
          title={run.state === "done" ? `${run.title}: done` : run.title}
          register="Devnet"
          closeLabel={`Close: ${run.title}`}
        >
          <StepRegister label={run.title} steps={registerSteps(run)} />
        </ProcessDialog>
      ) : null}
    </section>
  );
}
