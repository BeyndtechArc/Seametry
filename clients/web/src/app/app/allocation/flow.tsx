"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ContinueAction, Field, FilterBar, Key, LotMark, QuietAction, QuoteBlock, SelectionCount, StepBar, StepTrack, Stamp, StepRegister, type RegisterStep } from "@seametry/ui";
import { ProcessDialog, ProcessOutcome } from "@seametry/ui/modal-sheet";
import { Icon } from "@seametry/ui/icons";
import { describeSplit, formatAmount, parseAmount, splitEvenly } from "@/lib/amount";
import { patchLocalTrade, recordLocalTrade } from "@/lib/allocation/activity";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { OfferedLot, RefusedLot } from "@/lib/allocation/offer";
import { logoFor } from "@/lib/instrument-logos";
import { shortIssuer } from "@/lib/issuers";
import { SLIPPAGE_BPS, USDC_SCALE, lotCapAtoms, minimumPlanAtoms, routingFeeAtoms, routingFeeBps } from "@/lib/allocation/rules";
import { AllocationMotion, type AllocationMotionState } from "./allocation-motion";
import styles from "./allocation.module.css";

type Phase = "idle" | "preparing" | "signing" | "sending" | "settled" | "failed";

type Leg = {
  mint: string;
  symbol: string;
  atoms: bigint;
  phase: Phase;
  prepared?: PreparedLeg;
  signature?: string;
  note?: string;
  retryable?: boolean;
  uncertain?: boolean;
  walletBlocked?: boolean;
};

type PurchaseStage = "prepare" | "sign" | "confirm";
type PurchaseOutcome = "unsent" | "blocked" | "uncertain" | "failed";
type PurchaseRun = { mint: string; symbol: string; stage: PurchaseStage; state: "running" | "stopped" | "settled"; outcome?: PurchaseOutcome; problem?: { plain: string; technical?: string }; retryable?: boolean; signature?: string };

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly sent?: boolean) { super(message); }
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function keepUnsignedPlanInUrl(mints: string[], amount: string) {
  const url = new URL(window.location.href);
  if (mints.length) url.searchParams.set("selected", mints.join(","));
  else url.searchParams.delete("selected");
  if (amount.trim()) url.searchParams.set("amount", amount.trim());
  else url.searchParams.delete("amount");
  url.searchParams.delete("add");
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event("seametry:plan-url"));
}

function secondsUntil(iso: string, now: number) {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
}

function signedChange(atoms: string, scale: number, unit: string) {
  const sign = atoms.startsWith("-") ? "" : "+";
  return `${sign}${formatAmount(atoms, scale)} ${unit}`;
}

function reasonFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new ApiError(payload.error ?? `${path} answered ${response.status}`, response.status, payload.code, payload.sent);
  return payload as T;
}

function changedMessage(before: Uint8Array, originalBlockhash: string, signed: VersionedTransaction): string | undefined {
  const after = signed.message.serialize();
  if (before.length === after.length && before.every((byte, index) => byte === after[index])) return undefined;
  if (originalBlockhash !== signed.message.recentBlockhash) return "The wallet changed the recent blockhash.";
  return "The wallet changed the accounts, instructions, or lookup tables.";
}

function purchaseSteps(run: PurchaseRun | undefined): RegisterStep[] {
  const stages: { stage: PurchaseStage; title: string; glyph: RegisterStep["glyph"]; note: string }[] = [
    { stage: "prepare", title: "Prepare the purchase", glyph: "hall", note: "Checking the quote and simulating on mainnet" },
    { stage: "sign", title: "Sign in your wallet", glyph: "wallet", note: "Waiting for your wallet" },
    { stage: "confirm", title: "Confirm on mainnet", glyph: "confirm", note: "Waiting for the transaction status" },
  ];
  const reached = run ? stages.findIndex((stage) => stage.stage === run.stage) : -1;
  return stages.map((stage, index) => {
    const item = { title: stage.title, glyph: stage.glyph };
    if (run?.state === "settled" || (reached >= 0 && index < reached)) return { ...item, state: "done" };
    if (!run || index > reached) return { ...item, state: "waiting" };
    if (run.state === "stopped") return { ...item, state: "stopped", problem: run.problem };
    return { ...item, state: "now", note: stage.note };
  });
}

const phaseLabel: Record<Phase, string> = {
  idle: "Not bought",
  preparing: "Preparing",
  signing: "Signing",
  sending: "Sending",
  settled: "Settled",
  failed: "Not bought",
};

function OrderSummary({
  selectedSymbols,
  total,
  fee,
  feeBps,
  wallet,
}: {
  selectedSymbols: string[];
  total: string;
  fee: string;
  feeBps: number;
  wallet?: string;
}) {
  return (
    <div className={styles.orderSummary}>
      <header className={styles.orderIdentity}>
        <span>Allocation</span>
        <strong>Direct ownership</strong>
        <p>Each constituent settles to your wallet. No basket token is issued.</p>
      </header>
      <dl className={styles.orderFacts}>
        <div>
          <dt>Spend</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>Constituents</dt>
          <dd>{selectedSymbols.length || "None selected"}</dd>
        </div>
        <div>
          <dt>Minimum spend</dt>
          <dd>{selectedSymbols.length ? `${formatAmount(minimumPlanAtoms(selectedSymbols.length), USDC_SCALE)} USDC` : "1 USDC per constituent"}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>One swap per constituent</dd>
        </div>
        <div>
          <dt>Seametry routing fee, {formatAmount(BigInt(feeBps), 2)}%</dt>
          <dd>{fee}</dd>
        </div>
        <div>
          <dt>Slippage tolerance</dt>
          <dd>{formatAmount(BigInt(SLIPPAGE_BPS), 2)}% of each swap</dd>
        </div>
      </dl>
      <section className={styles.orderSelection} aria-label="Selected plan">
        <h3>Selected plan</h3>
        {selectedSymbols.length > 0 ? (
          <ul>
            {selectedSymbols.map((symbol) => (
              <li key={symbol}>{symbol}</li>
            ))}
          </ul>
        ) : (
          <p>Select at least one constituent.</p>
        )}
      </section>
      <section className={styles.orderDestination} aria-label="Receiving wallet">
        <h3>Receiving wallet</h3>
        {wallet ? <code>{wallet}</code> : <p>Connect the receiving wallet from the header. Connecting buys nothing.</p>}
      </section>
    </div>
  );
}

export function AllocationFlow({
  offered,
  refused,
  unavailable,
  initialSelected,
  initialAmount,
  allocationName,
  allocationTemplateId,
}: {
  offered: OfferedLot[];
  refused: RefusedLot[];
  unavailable?: string;
  initialSelected: string[];
  initialAmount: string;
  allocationName: string;
  allocationTemplateId?: string;
}) {
  const { publicKey, connected, signTransaction, signAllTransactions, disconnect } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const currentWallet = useRef(walletAddress);
  // Nothing starts chosen: choosing is the first step's whole question.
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [step, setStep] = useState(initialAmount && initialSelected.length > 0 ? 1 : 0);
  const [typed, setTyped] = useState(initialAmount);
  const [progress, setProgress] = useState<{ plan: string; changes: Record<string, Partial<Leg>> }>({ plan: "", changes: {} });
  const [purchaseRun, setPurchaseRun] = useState<PurchaseRun>();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [batchPhase, setBatchPhase] = useState<"idle" | "preflight" | "approval" | "settling">("idle");
  const allocationId = useRef<string>();

  const [query, setQuery] = useState("");
  const [backing, setBacking] = useState("any");
  const [issuer, setIssuer] = useState("any");
  const [minCapacity, setMinCapacity] = useState("0");
  const issuers = [...new Set(offered.map((lot) => lot.issuer))].sort();

  const parsed = typed.trim() === "" ? undefined : parseAmount(typed, USDC_SCALE);
  // Filters state a preference, so they shape the plan: a chosen lot they
  // hide leaves it, counted, rather than being bought out of sight. Search
  // only moves the view, so a chosen lot it hides stays in the plan.
  const preferred = offered.filter(
    (lot) => (backing === "any" || lot.grade === backing) && (issuer === "any" || lot.issuer === issuer) && lot.capacityUsdc >= Number(minCapacity),
  );
  const needle = query.trim().toLowerCase();
  const visible = needle === "" ? preferred : preferred.filter((lot) => lot.symbol.toLowerCase().includes(needle) || lot.issuer.toLowerCase().includes(needle));
  const chosen = preferred.filter((lot) => selected.includes(lot.mint));
  const chosenMints = chosen.map((lot) => lot.mint).join(",");
  const hiddenChosen = offered.filter((lot) => selected.includes(lot.mint)).length - chosen.length;
  const split = parsed && "atoms" in parsed ? splitEvenly(parsed.atoms, chosen.length) : [];
  const overCapacity = split.findIndex((atoms, index) => atoms > lotCapAtoms(chosen[index]?.capacityUsdc ?? 0));
  const amountProblem =
    parsed && "refused" in parsed
      ? parsed.refused
      : parsed && "atoms" in parsed && chosen.length > 0 && parsed.atoms < minimumPlanAtoms(chosen.length)
        ? `Spend at least ${formatAmount(minimumPlanAtoms(chosen.length), USDC_SCALE)} USDC for ${chosen.length} ${chosen.length === 1 ? "constituent" : "constituents"}. The minimum is 1 USDC each.`
      : overCapacity >= 0
        ? `${chosen[overCapacity].symbol} may take at most ${formatAmount(BigInt(chosen[overCapacity].capacityUsdc), 0)} USDC under this captured capacity decision.`
        : split.some((atoms) => atoms === 0n) && split.length > 0
          ? "The amount is too small to fund every selected constituent."
          : undefined;

  // The plan is derived from the inputs on every render. Progress is kept as
  // each leg's changes, and only while it belongs to the same plan; the
  // inputs lock once a leg has started, so progress never lands on another.
  const plan = `${walletAddress ?? "no-wallet"}|${typed}|${chosen.map((lot) => lot.mint).join(",")}`;
  const changes = progress.plan === plan ? progress.changes : {};
  const legs: Leg[] =
    amountProblem || split.length === 0
      ? []
      : chosen.map((lot, i) => ({ mint: lot.mint, symbol: lot.symbol, atoms: split[i], phase: "idle", ...changes[lot.mint] }));
  const started = legs.some((leg) => leg.phase !== "idle" || leg.note);

  useEffect(() => {
    currentWallet.current = walletAddress;
    // Clearing on the next microtask avoids a render-time state update while
    // invalidating any prepared transaction left by the previous wallet.
    queueMicrotask(() => setProgress({ plan: "", changes: {} }));
  }, [walletAddress]);

  // A wallet browser has a separate storage partition from Safari or Chrome.
  // Only unsigned plan inputs travel in the URL. A quote or approval must be
  // freshly prepared after the receiving wallet connects.
  useEffect(() => {
    if (started) return;
    keepUnsignedPlanInUrl(chosenMints ? chosenMints.split(",") : [], typed);
  }, [chosenMints, typed, started]);

  const anyPrepared = legs.some((leg) => leg.phase === "signing" || leg.phase === "sending");
  useEffect(() => {
    if (!anyPrepared) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyPrepared]);

  const update = useCallback(
    (mint: string, change: Partial<Leg>) => {
      setProgress((current) => {
        const kept = current.plan === plan ? current.changes : {};
        return { plan, changes: { ...kept, [mint]: { ...kept[mint], ...change } } };
      });
    },
    [plan],
  );

  const startOver = () => {
    setPurchaseOpen(false);
    setPurchaseRun(undefined);
    setProgress({ plan: "", changes: {} });
    setBatchPhase("idle");
    allocationId.current = undefined;
    setTyped("");
    keepUnsignedPlanInUrl(chosen.map((lot) => lot.mint), "");
    setStep(0);
  };

  const watch = useCallback(
    async (mint: string, signature: string) => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const query = new URLSearchParams({ signature, ...(walletAddress ? { wallet: walletAddress } : {}), mint });
          const response = await fetch(`/api/allocation/status?${query.toString()}`);
          const status = (await response.json()) as { state?: string; detail?: string; error?: string; tokenDeltaAtoms?: string; tokenDeltaScale?: number };
          if (status.state === "confirmed" || status.state === "finalized") {
            update(mint, { phase: "settled", note: `Settled, ${status.state} on mainnet.` });
            if (walletAddress) {
              patchLocalTrade(walletAddress, signature, {
                settled: true,
                ...(status.tokenDeltaAtoms && !status.tokenDeltaAtoms.startsWith("-") ? { settledAtoms: status.tokenDeltaAtoms } : {}),
                ...(status.tokenDeltaScale !== undefined ? { settledScale: status.tokenDeltaScale } : {}),
              });
            }
            setPurchaseRun((current) => current?.mint === mint ? { ...current, state: "settled", stage: "confirm", signature } : current);
            return;
          }
          if (status.state === "failed") {
            update(mint, { phase: "failed", note: "Mainnet rejected this purchase. Review the transaction before trying again.", retryable: false });
            setPurchaseRun((current) => current?.mint === mint ? { ...current, state: "stopped", stage: "confirm", outcome: "failed", problem: { plain: "Mainnet rejected this purchase. The network fee may have been charged.", technical: status.detail } } : current);
            return;
          }
        } catch {
          // A missed poll is retried; the signature stays on screen either way.
        }
      }
      update(mint, { note: "No confirmation within a minute. The signature below shows where it stands." });
      setPurchaseRun((current) => current?.mint === mint ? { ...current, state: "stopped", stage: "confirm", outcome: "uncertain", problem: { plain: "Confirmation has not arrived. Check the transaction signature before taking another action." } } : current);
    },
    [update, walletAddress],
  );

  // A submission error may arrive after broadcast. Never retry that leg from
  // the same plan without checking its on-chain state first.
  const walletBlocked = legs.some((leg) => leg.walletBlocked);
  const nextLeg = walletBlocked ? undefined : legs.find((leg) => leg.phase === "idle" || (leg.phase === "failed" && leg.retryable));
  const inFlight = legs.find((leg) => leg.phase === "preparing" || leg.phase === "signing" || leg.phase === "sending");
  const buying = useRef(false);

  const buy = async () => {
    const leg = nextLeg;
    if (!leg || !publicKey || !signTransaction || inFlight || buying.current) return;
    buying.current = true;
    setPurchaseOpen(true);
    setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "prepare", state: "running" });
    const signingWallet = walletAddress;
    update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined, signature: undefined, retryable: false, uncertain: false, walletBlocked: false });
    let prepared: PreparedLeg;
    try {
      // The plan's size sets the server-charged fee tier. A failed simulation
      // never reaches the wallet prompt.
      prepared = await postJson<PreparedLeg>("/api/allocation/prepare", {
        wallet: signingWallet,
        mint: leg.mint,
        usdcAtoms: leg.atoms.toString(),
        planMints: chosen.map((lot) => lot.mint),
      });
    } catch (error) {
      update(leg.mint, { phase: "idle", note: reasonFrom(error) });
      setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "prepare", state: "stopped", outcome: "unsent", retryable: true, problem: { plain: "The quote or mainnet check did not pass. Nothing was sent. A new quote can be requested.", technical: reasonFrom(error) } });
      buying.current = false;
      return;
    }
    if (currentWallet.current !== signingWallet) {
      buying.current = false;
      return;
    }
    update(leg.mint, { phase: "signing", prepared });
    setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "sign", state: "running" });
    let signed: VersionedTransaction;
    try {
      const original = VersionedTransaction.deserialize(fromBase64(prepared.transaction));
      const messageBeforeSigning = original.message.serialize().slice();
      const blockhashBeforeSigning = original.message.recentBlockhash;
      signed = await signTransaction(original);
      const change = changedMessage(messageBeforeSigning, blockhashBeforeSigning, signed);
      if (change) throw new ApiError(change, 409, "SIGNED_MESSAGE_CHANGED", false);
    } catch (error) {
      const changed = error instanceof ApiError && error.code === "SIGNED_MESSAGE_CHANGED";
      update(leg.mint, { phase: "failed", prepared: undefined, retryable: !changed, walletBlocked: changed, note: changed ? "Not sent. This wallet returned a different transaction. No USDC was spent." : "Not signed. Nothing was sent." });
      setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "sign", state: "stopped", outcome: changed ? "blocked" : "unsent", retryable: !changed, problem: { plain: changed ? "This wallet returned a different transaction from the purchase Seametry checked. Nothing was sent. No USDC was spent. Use another wallet to continue this plan." : "The wallet did not sign this purchase. Nothing was sent or spent.", technical: reasonFrom(error) } });
      buying.current = false;
      return;
    }
    if (currentWallet.current !== signingWallet) {
      buying.current = false;
      return;
    }
    update(leg.mint, { phase: "sending" });
    setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "confirm", state: "running" });
    try {
      const { signature } = await postJson<{ signature: string }>("/api/allocation/submit", {
        transaction: toBase64(signed.serialize()),
        approval: prepared.approval,
      });
      recordLocalTrade({ signature, wallet: publicKey.toBase58(), mint: leg.mint, symbol: leg.symbol, direction: "buy", inputAtoms: leg.atoms.toString(), inputScale: USDC_SCALE, submittedAt: new Date().toISOString() });
      update(leg.mint, { signature, note: "Sent. Waiting for mainnet to confirm." });
      void watch(leg.mint, signature);
    } catch (error) {
      const changed = error instanceof ApiError && error.code === "SIGNED_MESSAGE_CHANGED" && error.sent === false;
      update(leg.mint, { phase: "failed", retryable: false, walletBlocked: changed, uncertain: !changed, note: changed ? "Not sent. This wallet returned a different transaction. No USDC was spent." : "Submission could not be verified. Check this wallet's activity before buying again." });
      setPurchaseRun({ mint: leg.mint, symbol: leg.symbol, stage: "confirm", state: "stopped", outcome: changed ? "blocked" : "uncertain", problem: { plain: changed ? "This wallet returned a different transaction from the purchase Seametry checked. Nothing was sent. No USDC was spent. Use another wallet to continue this plan." : "Seametry could not verify whether this purchase reached mainnet. Check your wallet activity before trying again.", technical: reasonFrom(error) } });
    }
    buying.current = false;
  };

  const buyAll = async () => {
    const pending = legs.filter((leg) => leg.phase === "idle" || (leg.phase === "failed" && leg.retryable));
    if (!pending.length || !publicKey || (!signAllTransactions && !signTransaction) || inFlight || buying.current) return;
    buying.current = true;
    const signingWallet = walletAddress;
    if (!signingWallet) {
      buying.current = false;
      return;
    }
    const runId = allocationId.current ?? window.crypto.randomUUID();
    allocationId.current = runId;
    setBatchPhase("preflight");
    pending.forEach((leg) => update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined, signature: undefined, retryable: false, uncertain: false, walletBlocked: false }));

    const preparedResults = await Promise.all(pending.map(async (leg) => {
      try {
        const prepared = await postJson<PreparedLeg>("/api/allocation/prepare", {
          wallet: signingWallet,
          mint: leg.mint,
          usdcAtoms: leg.atoms.toString(),
          planMints: chosen.map((lot) => lot.mint),
        });
        update(leg.mint, { phase: "signing", prepared });
        return { leg, prepared };
      } catch (error) {
        update(leg.mint, { phase: "failed", note: reasonFrom(error), retryable: true });
        return { leg, error };
      }
    }));

    const ready = preparedResults.filter((result): result is { leg: Leg; prepared: PreparedLeg } => "prepared" in result);
    if (ready.length !== pending.length) {
      setBatchPhase("idle");
      buying.current = false;
      return;
    }
    if (currentWallet.current !== signingWallet) {
      setBatchPhase("idle");
      buying.current = false;
      return;
    }

    setBatchPhase("approval");
    const originals = ready.map(({ prepared }) => VersionedTransaction.deserialize(fromBase64(prepared.transaction)));
    const beforeSigning = originals.map((transaction) => ({
      message: transaction.message.serialize().slice(),
      blockhash: transaction.message.recentBlockhash,
    }));

    let signed: VersionedTransaction[];
    try {
      if (signAllTransactions) {
        signed = await signAllTransactions(originals);
      } else if (signTransaction) {
        signed = [];
        for (const transaction of originals) signed.push(await signTransaction(transaction));
      } else {
        throw new Error("This wallet does not offer transaction signing.");
      }
      const changed = signed.findIndex((transaction, index) => changedMessage(beforeSigning[index].message, beforeSigning[index].blockhash, transaction));
      if (changed >= 0) throw new ApiError("The wallet changed one of the transactions Seametry checked.", 409, "SIGNED_MESSAGE_CHANGED", false);
    } catch (error) {
      const blocked = error instanceof ApiError && error.code === "SIGNED_MESSAGE_CHANGED";
      ready.forEach(({ leg }) => update(leg.mint, {
        phase: "failed",
        prepared: undefined,
        retryable: !blocked,
        walletBlocked: blocked,
        note: blocked ? "Not sent. The wallet changed a checked transaction." : "The allocation was not signed. Nothing was sent.",
      }));
      setBatchPhase("idle");
      buying.current = false;
      return;
    }

    if (currentWallet.current !== signingWallet) {
      setBatchPhase("idle");
      buying.current = false;
      return;
    }

    setBatchPhase("settling");
    ready.forEach(({ leg, prepared }) => update(leg.mint, { phase: "sending", prepared }));

    await Promise.all(ready.map(async ({ leg, prepared }, index) => {
      try {
        const { signature } = await postJson<{ signature: string }>("/api/allocation/submit", {
          transaction: toBase64(signed[index].serialize()),
          approval: prepared.approval,
        });
        recordLocalTrade({
          signature,
          wallet: signingWallet,
          mint: leg.mint,
          symbol: leg.symbol,
          direction: "buy",
          inputAtoms: leg.atoms.toString(),
          inputScale: USDC_SCALE,
          submittedAt: new Date().toISOString(),
          allocationId: runId,
          allocationName,
          allocationTemplateId,
        });
        update(leg.mint, { signature, note: "Sent. Waiting for mainnet to confirm." });
        void watch(leg.mint, signature);
      } catch (error) {
        const changed = error instanceof ApiError && error.code === "SIGNED_MESSAGE_CHANGED" && error.sent === false;
        update(leg.mint, {
          phase: "failed",
          retryable: false,
          walletBlocked: changed,
          uncertain: !changed,
          note: changed ? "Not sent. The signed transaction no longer matched the approved plan." : "Submission could not be verified. Check wallet activity before another attempt.",
        });
      }
    }));
    buying.current = false;
  };

  const keyDisabledReason = unavailable
    ? unavailable
    : !connected
      ? "Connect a wallet first."
      : !signTransaction && !signAllTransactions
        ? "This wallet does not offer transaction signing."
        : inFlight
          ? `${phaseLabel[inFlight.phase]} ${inFlight.symbol}.`
          : walletBlocked
            ? "This wallet changed the prepared transaction. Connect another wallet to continue this plan."
          : !nextLeg
            ? "No unbought purchase can be safely retried from this plan."
            : undefined;

  const attempted = legs.filter((leg) => leg.phase === "settled" || leg.phase === "failed");
  const settledCount = legs.filter((leg) => leg.phase === "settled").length;
  const uncertainCount = legs.filter((leg) => leg.uncertain).length;
  const failedCount = legs.filter((leg) => leg.phase === "failed").length;
  const motionState: AllocationMotionState =
    batchPhase === "preflight" ? "preflight" :
    batchPhase === "approval" ? "approval" :
    legs.some((leg) => leg.phase === "sending") ? "settling" :
    legs.length > 0 && settledCount === legs.length ? "success" :
    settledCount > 0 && failedCount > 0 ? "partial" :
    failedCount > 0 && settledCount === 0 ? "failure" :
    "idle";
  const total = parsed && "atoms" in parsed ? `${formatAmount(parsed.atoms, USDC_SCALE)} USDC` : "Not set";
  // Per leg, as Jupiter rounds each swap's fee, then summed; the prepared leg
  // later shows the exact fee its simulation moved.
  const feeBps = routingFeeBps(Math.max(chosen.length, 1));
  const fee = split.length > 0 ? `${formatAmount(split.reduce((sum, atoms) => sum + routingFeeAtoms(atoms, feeBps), 0n), USDC_SCALE)} USDC` : "Not set";
  const orderSummary = (
    <OrderSummary
      selectedSymbols={chosen.map((lot) => lot.symbol)}
      total={total}
      fee={fee}
      feeBps={feeBps}
      wallet={publicKey?.toBase58()}
    />
  );

  // Two steps: what the basket holds, then how much and the purchases
  // themselves, since the amount is only ever read against those purchases.
  const steps = ["Choose", "Buy"];
  const continueReason = chosen.length === 0 ? "Choose at least one constituent." : undefined;
  const backReason = started ? "Purchases have started. Start a new allocation to change the plan." : undefined;
  const planLine = [chosen.length === 0 ? "Nothing chosen" : `${chosen.length} chosen`, parsed && "atoms" in parsed ? total : ""].filter(Boolean).join(", ");

  return (
    <div className={styles.flow}>
      <ProcessDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        title={purchaseRun?.symbol ? `${purchaseRun.symbol} purchase` : "Purchase"}
        register="Mainnet"
        closeLabel="Close purchase status"
        footer={purchaseRun?.state === "stopped" && purchaseRun.retryable ? <QuietAction type="button" onClick={() => void buy()}>Prepare {purchaseRun.symbol} again</QuietAction> : purchaseRun?.outcome === "blocked" ? <QuietAction type="button" onClick={() => { setPurchaseOpen(false); void disconnect(); }}>Disconnect wallet</QuietAction> : undefined}
      >
        {purchaseRun?.state === "running" ? <StepRegister label={`Purchase ${purchaseRun.symbol}`} steps={purchaseSteps(purchaseRun)} /> : purchaseRun ? (
          <ProcessOutcome kind={purchaseRun.state === "settled" ? "success" : purchaseRun.outcome === "uncertain" ? "pending" : "error"} title={purchaseRun.state === "settled" ? "Purchase settled" : purchaseRun.outcome === "blocked" ? "Purchase not sent" : purchaseRun.outcome === "uncertain" ? "Check wallet activity" : purchaseRun.outcome === "failed" ? "Purchase failed on mainnet" : purchaseRun.stage === "sign" ? "Purchase not signed" : "Purchase not prepared"}>
            <div className={styles.outcomeBody}>
              <p>{purchaseRun.state === "settled" ? "Mainnet confirmed this transaction." : purchaseRun.problem?.plain}</p>
              {purchaseRun.problem?.technical ? <details><summary>Technical detail</summary><pre>{purchaseRun.problem.technical}</pre></details> : null}
              {purchaseRun.signature ? <a className={styles.signature} href={`https://explorer.solana.com/tx/${purchaseRun.signature}`} rel="noreferrer" target="_blank">View transaction</a> : null}
            </div>
          </ProcessOutcome>
        ) : null}
      </ProcessDialog>
      {unavailable ? (
        <p className={styles.unavailable} role="note">
          {unavailable}
        </p>
      ) : null}

      <StepTrack label="Allocation steps" steps={steps} current={step} onStep={(index) => !started && setStep(index)} />

      <div className={styles.workspace}>
        <div className={styles.builder}>
          {step === 0 ? (
              <section className={styles.section} aria-label="Choose the constituents">
                <p className={styles.quiet}>Allow at least 1 USDC per constituent, plus SOL for network fees. A live route may need more.</p>
                {offered.length > 0 ? (
                  <FilterBar
                    searchLabel="Search by symbol or issuer"
                    query={query}
                    onQuery={setQuery}
                    shown={visible.length}
                    total={offered.length}
                    note={[
                      visible.length === 0 ? (needle ? `Nothing matches "${query.trim()}".` : "Nothing matches these filters; widen Backing, Issuer or Capacity.") : "",
                      hiddenChosen > 0 ? `${hiddenChosen} chosen ${hiddenChosen === 1 ? "is" : "are"} outside the filters and left out of the plan.` : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    groups={[
                      {
                        name: "backing",
                        label: "Backing",
                        value: backing,
                        onChange: setBacking,
                        options: [
                          { value: "any", label: "Any" },
                          { value: "Entitlement", label: "Entitlement" },
                          { value: "Certificate", label: "Certificate" },
                        ],
                      },
                      {
                        name: "issuer",
                        label: "Issuer",
                        value: issuer,
                        onChange: setIssuer,
                        options: [{ value: "any", label: "Any" }, ...issuers.map((name) => ({ value: name, label: shortIssuer(name) }))],
                      },
                      {
                        name: "capacity",
                        label: "Measured capacity",
                        value: minCapacity,
                        onChange: setMinCapacity,
                        options: [
                          { value: "0", label: "Any" },
                          { value: "1000", label: "1,000 USDC or more" },
                          { value: "10000", label: "10,000 USDC" },
                        ],
                      },
                    ]}
                  />
                ) : null}
                {offered.length === 0 ? (
                  <p className={styles.quiet}>No instrument is eligible under this policy at the measured reference size.</p>
                ) : (
                  <ul className={styles.lots}>
                    {visible.map((lot) => (
                      <li key={lot.mint} className={styles.lot}>
                        <div className={styles.lotChoice}>
                          <Link className={styles.lotDetail} href={`/app/instruments/${encodeURIComponent(lot.mint)}?from=allocation&selected=${encodeURIComponent(selected.join(","))}`} aria-label={`Open ${lot.symbol} assay`}>
                            <LotMark symbol={lot.symbol} src={logoFor(lot.mint)} size="list" />
                            <span>
                              <b>{lot.symbol}</b>
                              <small>{lot.issuer}</small>
                            </span>
                          </Link>
                          <label className={styles.lotToggle}>
                            <input
                              type="checkbox"
                              aria-label={`Add ${lot.symbol} to the basket`}
                              disabled={started}
                              checked={selected.includes(lot.mint)}
                              onChange={(event) => {
                                const next = event.target.checked ? [...selected, lot.mint] : selected.filter((mint) => mint !== lot.mint);
                                setSelected(next);
                                keepUnsignedPlanInUrl(preferred.filter((entry) => next.includes(entry.mint)).map((entry) => entry.mint), typed);
                              }}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {refused.length > 0 ? (
                  <details className={styles.refused}>
                    <summary>
                      {refused.length} captured {refused.length === 1 ? "instrument is" : "instruments are"} unavailable under this policy
                    </summary>
                    <ul>
                      {refused.map((lot) => (
                        <li key={lot.symbol}>
                          <b>{lot.symbol}</b>
                          <Stamp kind="block" reason={lot.fact} />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
          ) : null}

          {step === 1 ? (
            <section className={styles.section} aria-label="Set the basket amount">
              <Field
                id="allocation-usdc"
                label="USDC to spend"
                endAdornment={<><Icon name="currency" />USDC</>}
                inputMode="decimal"
                autoComplete="off"
                placeholder="250"
                value={typed}
                disabled={started}
                invalid={Boolean(amountProblem)}
                message={amountProblem ?? (legs.length > 0 ? describeSplit(legs, USDC_SCALE, "USDC") : "Seametry divides one total evenly across what you chose.")}
                onChange={(event) => {
                  setTyped(event.target.value);
                  keepUnsignedPlanInUrl(chosen.map((lot) => lot.mint), event.target.value);
                }}
              />
            </section>
          ) : null}

          {step === 1 && legs.length > 0 ? (
            <>
              {/* On a phone the order sheet is not beside the steps, so the
                  step where signing happens carries it. */}
              <div className={styles.orderInline} data-testid="order-sheet-inline">{orderSummary}</div>
              <section className={styles.section} aria-label="Buy allocation">
                <AllocationMotion state={motionState} total={legs.length} settled={settledCount} />
                <p className={styles.quiet}>One allocation decision, independently simulated legs. Wallets with batch signing can approve the set together; other wallets may still show more than one signature prompt.</p>
                <ol className={styles.legs}>
                  {legs.map((leg) => {
                    const secondsLeft = leg.prepared ? secondsUntil(leg.prepared.expiresAt, now) : 0;
                    return (
                      <li key={leg.mint} className={styles.leg} data-phase={leg.phase}>
                        <header>
                          <b>
                            {leg.symbol}, {formatAmount(leg.atoms, USDC_SCALE)} USDC
                          </b>
                          <span>{leg.walletBlocked ? "Not sent" : leg.phase === "failed" && leg.retryable ? "Prepare again" : leg.uncertain ? "Check wallet" : phaseLabel[leg.phase]}</span>
                        </header>
                        {leg.phase === "preparing" ? (
                          <p className={styles.loading}>Loading quotes for {formatAmount(leg.atoms, USDC_SCALE)} USDC</p>
                        ) : null}
                        {leg.prepared && leg.phase === "signing" ? (
                          <>
                            <QuoteBlock
                              floor={formatAmount(leg.prepared.floorAtoms, leg.prepared.outScale)}
                              expected={formatAmount(leg.prepared.outAtoms, leg.prepared.outScale)}
                              unit={leg.symbol}
                              fees={[
                                { label: `Seametry routing fee, ${formatAmount(BigInt(leg.prepared.routingFeeBps), 2)}%`, value: `${formatAmount(leg.prepared.routingFeeAtoms, USDC_SCALE)} USDC` },
                                { label: "Priority fee set by the route", value: `${formatAmount(leg.prepared.priorityFeeLamports, 9)} SOL` },
                                { label: "Venue fees", value: "Included in the expected output" },
                              ]}
                              route={`Jupiter, through ${leg.prepared.route.join(", ")}, quoted at slot ${leg.prepared.contextSlot}`}
                              received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(leg.prepared.receivedAt)) / 1000))}s`, absolute: leg.prepared.receivedAt }}
                              secondsLeft={secondsLeft}
                            />
                            <p className={styles.simulated}>
                              Simulated on mainnet for this wallet:{" "}
                              {leg.prepared.simulated.map((change) => signedChange(change.atoms, change.scale, change.unit)).join("; ")}.
                            </p>
                          </>
                        ) : null}
                        {leg.note ? <p className={styles.note}>{leg.note}</p> : null}
                        {leg.signature ? (
                          <a className={styles.signature} href={`https://explorer.solana.com/tx/${leg.signature}`} rel="noreferrer" target="_blank">
                            {leg.signature}
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                {attempted.length > 0 ? (
                  <p className={styles.summary} role={uncertainCount ? "alert" : "status"}>
                    {settledCount} of {legs.length} {legs.length === 1 ? "purchase" : "purchases"} settled.
                    {walletBlocked ? " This wallet could not sign this purchase. The remaining purchases are paused." : uncertainCount ? ` ${uncertainCount} ${uncertainCount === 1 ? "submission needs" : "submissions need"} a wallet activity check.` : attempted.length === legs.length && settledCount < legs.length ? " The remaining purchases were not sent or did not settle." : ""}
                  </p>
                ) : null}
                {settledCount > 0 ? <Link href="/app/positions" className={styles.holdingsLink}>View holdings and sell</Link> : null}
                {started && !inFlight && !walletBlocked ? <QuietAction onClick={startOver}>Start new allocation</QuietAction> : null}
              </section>
            </>
          ) : null}
        </div>

        <aside className={styles.orderRail} aria-label="Order sheet">
          <div className={styles.orderRailInner}>{orderSummary}</div>
        </aside>
      </div>

      {step === 0 ? (
        <div className={styles.selectionBar} data-testid="selection-action-bar">
          <SelectionCount current={chosen.length} total={offered.length} />
          <ContinueAction disabled={Boolean(continueReason)} title={continueReason} onClick={() => setStep(1)}>
            Set amount
          </ContinueAction>
        </div>
      ) : (
        <StepBar
          plan={planLine}
          problem={false}
          back={
            <QuietAction icon="back" disabled={Boolean(backReason)} title={backReason} onClick={() => setStep(0)}>
              Back
            </QuietAction>
          }
          next={
            !connected ? (
              <ContinueAction onClick={() => document.getElementById("app-wallet")?.click()}>Connect wallet</ContinueAction>
            ) : walletBlocked ? (
              <span>Purchase paused</span>
            ) : nextLeg || inFlight ? (
              <Key
                busy={Boolean(inFlight) || batchPhase !== "idle"}
                busyLabel={batchPhase === "preflight" ? "Checking every leg" : batchPhase === "approval" ? "Waiting for wallet" : inFlight ? "Settling allocation" : undefined}
                disabled={Boolean(keyDisabledReason) && !inFlight}
                onClick={() => void buyAll()}
              >
                Buy allocation
              </Key>
            ) : (
              <span>{uncertainCount ? "Check wallet activity" : settledCount === legs.length ? "Purchases settled" : "Review purchase status"}</span>
            )
          }
        />
      )}
    </div>
  );
}
