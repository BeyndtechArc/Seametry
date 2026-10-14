"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, Field, Key, QuietAction, StepRegister, StepTrack, type RegisterStep } from "@seametry/ui";
import type { IconName } from "@seametry/ui/icons";
import { ModalSheet, ProcessDialog, ProcessOutcome } from "@seametry/ui/modal-sheet";
import { buildDelivery, buildMelt, buildStrike, readClaim, type ClaimLeg } from "@/lib/alloys/hall-transactions";
import { formatAmount, parseAmount } from "@/lib/amount";
import { legIdentity } from "@/lib/alloys/records";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID, SHARE_DECIMALS } from "@/lib/hall/constants";
import { ownerTokenAccount } from "@/lib/hall/pda";
import { hallProgram } from "@/lib/hall/program";
import { awaitLanding } from "@/lib/landing";
import { DELIVERY, MELT, STRIKE, requestProblem, type RequestStage, type RequestSubject, type StageProblem } from "@/lib/request-problem";
import type { Alloy, CostRow, Envelope } from "@/lib/terminal-contract";
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
  /** Melt confirmed but Delivery did not; the Claim is the recovery path. */
  recoverableClaim?: boolean;
};

const PREPARE: Step = { title: "Prepare the stand-ins", glyph: "hall", note: "Minting the devnet stand-ins this Strike takes into your wallet", subject: STRIKE };
const signStep = (subject: RequestSubject): Step => ({ title: `Sign the ${subject.noun} in your wallet`, glyph: "wallet", note: `Approve the ${subject.noun} in your wallet`, subject });
const confirmStep = (subject: RequestSubject): Step => ({ title: `Confirm the ${subject.noun} on devnet`, glyph: "confirm", note: "Waiting for devnet", subject });

function QuantityTerms({ alloy, atoms, side, onReady }: { alloy: Alloy; atoms?: bigint; side: "strike" | "melt"; onReady: (shares?: string) => void }) {
  const [answer, setAnswer] = useState<{ shares: string; terms: Envelope<CostRow>; receivedAt: number }>();
  const [problem, setProblem] = useState<{ shares: string; detail: string }>();
  const key = atoms && atoms > 0n ? atoms.toString() : undefined;

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/terminal/alloys/${encodeURIComponent(alloy.address)}/terms?side=${side}&shares=${key}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail ?? "The Gateway did not provide terms.");
        if (!controller.signal.aborted) {
          setAnswer({ shares: key, terms: body as Envelope<CostRow>, receivedAt: Date.now() });
          setProblem(undefined);
          onReady(key);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setProblem({ shares: key, detail: error instanceof Error ? error.message : "The Gateway did not provide terms." });
          onReady(undefined);
        }
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [alloy.address, key, side, onReady]);

  if (!key) return <p>Enter a share amount to read the constituent quantities.</p>;
  if (problem?.shares === key) return <p role="alert">{problem.detail}</p>;
  if (answer?.shares !== key) return <p>Reading {side === "strike" ? "deposit" : "return"} quantities from the Hall.</p>;
  const { data, meta } = answer.terms;
  const age = Number.isFinite(Date.parse(meta.as_of)) ? Math.max(0, Math.floor((answer.receivedAt - Date.parse(meta.as_of)) / 1000)) : undefined;
  return (
    <div className={styles.quantityTerms}>
      <p>{side === "strike" ? "You deposit" : "You receive or claim"}</p>
      <ul aria-label={`${side === "strike" ? "Strike" : "Melt"} quantities`}>
        {data.legs.map((leg) => {
          const identity = legIdentity(alloy, leg.stock);
          const held = side === "melt" && alloy.legs.some((candidate) => candidate.mint === leg.stock && candidate.held_back);
          return <li key={leg.stock}><span>{identity.symbol ?? leg.stock}</span><span>{formatAmount(leg.amount.atoms, leg.amount.scale)}{held ? " held as Claim" : ""}</span></li>;
        })}
      </ul>
      <small>Solana {meta.cluster ?? "network unavailable"} via Gateway; observed {age === undefined ? "at an unavailable time" : `${age}s ago`}; evidence {meta.completeness}.</small>
      <small>No USD price is set by the Hall. These are token quantities, not a USDC purchase quote.</small>
    </div>
  );
}

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
  const [progressOpen, setProgressOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState(0);
  const [side, setSide] = useState<"strike" | "melt">("strike");
  const [strikeReady, setStrikeReady] = useState<string>();
  const [meltReady, setMeltReady] = useState<string>();

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
      const confirmed = new Set<RequestSubject>();
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
        confirmed.add(steps[step].subject);
        return signature;
      };
      setSheetOpen(false);
      setProgressOpen(true);
      setOutcomeOpen(false);
      advance(0, "prepare");
      try {
        await body(advance, sign);
        setRun({ title, steps, at: steps.length, state: "done" });
        setProgressOpen(false);
        setOutcomeOpen(true);
      } catch (error) {
        const current = steps[Math.min(at, steps.length - 1)];
        const recoverableClaim = confirmed.has(MELT) && current.subject === DELIVERY;
        const problem = recoverableClaim
          ? {
              plain: "The Melt confirmed, so the shares have already returned to the Hall. Delivery stopped, but every undelivered stock remains in your Claim. Continue delivery without melting again.",
              technical: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            }
          : requestProblem(current.subject, stage, error);
        setRun({ title, steps, at, state: "stopped", problem, recoverableClaim });
        setProgressOpen(false);
        setOutcomeOpen(true);
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
      const currentClaim = (await readClaim(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey)).filter((leg) => !alloy.legs[leg.index]?.held_back);
      for (const transaction of await buildDelivery(connection, program, REGISTER_HALL_PROGRAM_ID, alloyKey, publicKey, currentClaim)) {
        await sign(0, transaction);
      }
    });

  const notConnected = connected ? undefined : "Log in with a devnet wallet: it signs the Strike or Melt.";
  // Read live from chain by the Gateway: a frozen Hall account refuses every
  // Strike (HALL.md 4.6), so the Key says so instead of asking for a signature.
  const heldBack = alloy.legs.filter((leg) => leg.held_back).map((leg) => legIdentity(alloy, leg.mint).symbol ?? leg.mint);
  const strikeHeld = heldBack.length
    ? `Strike refused: ${heldBack.join(", ")} ${heldBack.length === 1 ? "is" : "are"} held back by ${heldBack.length === 1 ? "its issuer" : "their issuers"}, so the Hall cannot take ${heldBack.length === 1 ? "it" : "them"} in. Melt still works.`
    : undefined;
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
    <>
      <Key type="button" onClick={() => {
        // Only a running action reopens its progress. A finished one reopened
        // its outcome on every press, so after a Strike Melt was unreachable.
        if (run?.state === "running") { setProgressOpen(true); return; }
        setRun(undefined);
        setOutcomeOpen(false);
        setSheetStep(0);
        setSheetOpen(true);
      }}>Strike or Melt</Key>
      <ModalSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Strike or Melt"
        register="Devnet Hall"
        closeLabel="Close Alloy actions"
        footer={sheetStep === 0 ? (
          <ContinueAction type="button" onClick={() => setSheetStep(1)}>Set {side === "strike" ? "Strike" : "Melt"} amount</ContinueAction>
        ) : side === "strike" ? (
          <Key type="button" disabled={Boolean(strikeHeld) || Boolean(notConnected) || !("atoms" in strikeAmount) || strikeAmount.atoms === 0n || ("atoms" in strikeAmount && strikeReady !== strikeAmount.atoms.toString())} disabledReason={strikeHeld ?? notConnected ?? "Reading the current deposit quantities."} blockedTitle={strikeHeld ? "Strike refused while a leg is held back" : undefined} resolve={strikeHeld ? (close) => <ContinueAction type="button" onClick={() => { close(); setSide("melt"); }}>Melt instead</ContinueAction> : undefined} busy={busy} busyLabel="Working" onClick={() => "atoms" in strikeAmount && void strike(strikeAmount.atoms)}>Strike shares</Key>
        ) : (
          <Key type="button" disabled={Boolean(meltReason) || !("atoms" in meltAmount) || meltAmount.atoms === 0n || ("atoms" in meltAmount && meltReady !== meltAmount.atoms.toString())} disabledReason={meltReason ?? "Reading the current return quantities."} busy={busy} busyLabel="Working" onClick={() => "atoms" in meltAmount && void melt(meltAmount.atoms)}>Melt shares</Key>
        )}
      >
      <section className={styles.alloyActions} aria-label="Strike or Melt">
        <StepTrack steps={["Choose action", "Set amount"]} current={sheetStep} onStep={setSheetStep} label="Alloy action steps" />
      {sheetStep === 0 ? <div className={styles.actionChoices} role="radiogroup" aria-label="Alloy action">
        <button type="button" role="radio" aria-checked={side === "strike"} onClick={() => setSide("strike")}>
          <b>Strike</b><span>Deposit the Formula and receive Alloy shares.</span>
        </button>
        <button type="button" role="radio" aria-checked={side === "melt"} onClick={() => setSide("melt")}>
          <b>Melt</b><span>Return Alloy shares and receive each constituent.</span>
        </button>
      </div> : side === "strike" ? <div className={styles.actionCard}>
        <p>Deposit the stocks one share holds and receive new shares. On devnet, Seametry first mints the stand-ins into your wallet.</p>
        <Field id="strike-shares" label="Shares to Strike" inputMode="decimal" value={strikeTyped} onChange={(event) => { setStrikeReady(undefined); setStrikeTyped(event.target.value); }} message={"refused" in strikeAmount ? strikeAmount.refused : undefined} invalid={"refused" in strikeAmount} />
        <QuantityTerms alloy={alloy} atoms={"atoms" in strikeAmount ? strikeAmount.atoms : undefined} side="strike" onReady={setStrikeReady} />
      </div> : <div className={styles.actionCard}>
        <p>{shares !== undefined && connected ? `You hold ${formatAmount(shares, SHARE_DECIMALS)} shares. ` : ""}Return shares and take every stock back. A stock its issuer holds back stays in your Claim.</p>
        <Field id="melt-shares" label="Shares to Melt" inputMode="decimal" value={meltTyped} onChange={(event) => { setMeltReady(undefined); setMeltTyped(event.target.value); }} message={"refused" in meltAmount ? meltAmount.refused : undefined} invalid={"refused" in meltAmount} />
        {shares !== undefined && shares > 0n ? <div className={styles.shareShortcuts}>
          <QuietAction type="button" onClick={() => { setMeltReady(undefined); setMeltTyped(formatAmount(shares / 4n, SHARE_DECIMALS).replace(/,/g, "")); }}>Use 25%</QuietAction>
          <QuietAction type="button" onClick={() => { setMeltReady(undefined); setMeltTyped(formatAmount(shares / 2n, SHARE_DECIMALS).replace(/,/g, "")); }}>Use 50%</QuietAction>
          <QuietAction type="button" onClick={() => { setMeltReady(undefined); setMeltTyped(formatAmount(shares, SHARE_DECIMALS).replace(/,/g, "")); }}>Use max</QuietAction>
        </div> : null}
        <QuantityTerms alloy={alloy} atoms={"atoms" in meltAmount ? meltAmount.atoms : undefined} side="melt" onReady={setMeltReady} />
        {deliverable.length > 0 ? (
          <QuietAction type="button" disabled={busy} onClick={() => void deliver()}>
            Deliver your Claim ({deliverable.length} {deliverable.length === 1 ? "stock" : "stocks"})
          </QuietAction>
        ) : null}
      </div>}
      </section>
      </ModalSheet>
      {run?.state === "running" ? (
        <ProcessDialog
          open={progressOpen}
          onClose={() => setProgressOpen(false)}
          title={run.title}
          register="Devnet"
          closeLabel={`Close: ${run.title}`}
        >
          <StepRegister label={run.title} steps={registerSteps(run)} />
        </ProcessDialog>
      ) : null}
      {run && run.state !== "running" ? <ProcessDialog
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        title={run.state === "done" ? "Action confirmed" : "Action stopped"}
        register="Devnet"
        closeLabel="Close Alloy outcome"
        footer={run.recoverableClaim
          ? <ContinueAction type="button" onClick={() => { setOutcomeOpen(false); void deliver(); }}>Continue delivery</ContinueAction>
          : <ContinueAction type="button" onClick={() => setOutcomeOpen(false)}>Done</ContinueAction>}
      >
        {run.state === "done" ? <ProcessOutcome kind="success" title="Confirmed on devnet"><p>{run.title} completed.</p></ProcessOutcome> : <ProcessOutcome kind="error" title="Action stopped"><p>{run.problem?.plain ?? "The action stopped before confirmation."}</p>{run.problem?.technical ? <details><summary>Technical detail</summary><pre>{run.problem.technical}</pre></details> : null}</ProcessOutcome>}
      </ProcessDialog> : null}
    </>
  );
}
