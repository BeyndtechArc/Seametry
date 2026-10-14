"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ContinueAction, Field, FilterBar, Key, LotMark, QuietAction, QuoteBlock, RouteAction, SelectionCount, StepBar, StepRegister, StepTrack, Stamp, type RegisterStep } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { ProcessDialog, ProcessOutcome } from "@seametry/ui/modal-sheet";
import { describeSplit, formatAmount, parseAmount, splitByWeights, splitEvenly } from "@/lib/amount";
import { patchLocalTrade, recordLocalTrade } from "@/lib/allocation/activity";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { OfferedLot, RefusedLot } from "@/lib/allocation/offer";
import { logoFor } from "@/lib/instrument-logos";
import { shortIssuer } from "@/lib/issuers";
import { SLIPPAGE_BPS, USDC_SCALE, lotCapAtoms, minimumPlanAtoms, routingFeeAtoms, routingFeeBps } from "@/lib/allocation/rules";
import { AllocationMotion, type AllocationMotionState } from "./allocation-motion";
import styles from "./allocation.module.css";

type Phase = "idle" | "preparing" | "signing" | "sending" | "settled" | "failed";
type BatchPhase = "idle" | "preflight" | "approval" | "settling";
type BatchProblem = { at: 0 | 1 | 2; plain: string; technical?: string };

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

type UnsignedPlan = { mints: string[]; amount: string; weights?: Record<string, string> };

// weights is written in the same order as selected, one entry per mint, so the
// page that reads it back can pair them without trusting any other order.
function keepUnsignedPlanInUrl({ mints, amount, weights }: UnsignedPlan) {
  const url = new URL(window.location.href);
  if (mints.length) url.searchParams.set("selected", mints.join(","));
  else url.searchParams.delete("selected");
  if (amount.trim()) url.searchParams.set("amount", amount.trim());
  else url.searchParams.delete("amount");
  if (weights && mints.length) url.searchParams.set("weights", mints.map((mint) => weights[mint]?.trim() || "0").join(","));
  else url.searchParams.delete("weights");
  url.searchParams.delete("add");
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event("seametry:plan-url"));
}

// The custom form opens on the equal split, in whole percents, the leftover
// percents going to the first constituents as splitEvenly does with atoms.
function evenWeights(mints: string[]): Record<string, string> {
  const shares = splitEvenly(100n, mints.length);
  return Object.fromEntries(mints.map((mint, index) => [mint, shares[index].toString()]));
}

function describeWeightedSplit(legs: { atoms: bigint }[]) {
  const amounts = legs.map((leg) => leg.atoms);
  const least = amounts.reduce((a, b) => (b < a ? b : a));
  const most = amounts.reduce((a, b) => (b > a ? b : a));
  return `${legs.length} purchases by weight, from ${formatAmount(least, USDC_SCALE)} to ${formatAmount(most, USDC_SCALE)} USDC. Each purchase states its exact amount below.`;
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

function technicalFrom(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error ? `${error.name}: ${error.message}\nCause: ${cause.name}: ${cause.message}` : `${error.name}: ${error.message}`;
}

function stoppedAllocation(at: BatchProblem["at"], error: unknown): BatchProblem {
  const message = reasonFrom(error);
  if (at === 0) {
    return {
      at,
      plain: error instanceof TypeError
        ? "Seametry could not reach the route service. Nothing was signed or spent. Check the connection and try again."
        : `${message} Nothing was signed or spent.`,
      technical: error instanceof ApiError ? undefined : technicalFrom(error),
    };
  }
  if (at === 1) {
    const declined = /user rejected|user denied|user declined|rejected the request/i.test(message);
    return {
      at,
      plain: declined
        ? "You declined the allocation in your wallet. Nothing was sent or spent."
        : "The wallet did not sign the complete allocation. Nothing was sent or spent.",
      technical: declined ? undefined : technicalFrom(error),
    };
  }
  return {
    at,
    plain: "One or more signed purchases did not receive a submit receipt. Seametry is checking their signatures on mainnet before another attempt is allowed.",
    technical: technicalFrom(error),
  };
}

function allocationSteps(phase: BatchPhase, problem?: BatchProblem): RegisterStep[] {
  const active = phase === "preflight" ? 0 : phase === "approval" ? 1 : 2;
  const definitions = [
    { title: "Check every route", glyph: "assay" as const, note: "Quoting and simulating every constituent before your wallet is asked" },
    { title: "Approve one allocation", glyph: "wallet" as const, note: "Batch signing the complete set where the wallet supports it" },
    { title: "Confirm every purchase", glyph: "confirm" as const, note: "Watching each signed purchase on mainnet until it settles or expires" },
  ];
  return definitions.map((step, index) => {
    if (problem && index === problem.at) return { ...step, state: "stopped" as const, problem: { plain: problem.plain, technical: problem.technical } };
    if (problem) return { ...step, state: index < problem.at ? "done" as const : "waiting" as const };
    return { ...step, state: index < active ? "done" as const : index === active ? "now" as const : "waiting" as const };
  });
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
  initialWeights,
  template,
  fixedTemplate = false,
}: {
  offered: OfferedLot[];
  refused: RefusedLot[];
  unavailable?: string;
  initialSelected: string[];
  initialAmount: string;
  /** Whole-percent weights by mint; absent means an equal split. */
  initialWeights?: Record<string, string>;
  /** The published basket this plan starts from. Complete when every constituent is admitted. */
  template?: { id: string; name: string; complete: boolean };
  /** A published, admitted basket: skip custom constituent selection. */
  fixedTemplate?: boolean;
}) {
  const { publicKey, connected, signTransaction, signAllTransactions } = useWallet();
  const walletAddress = publicKey?.toBase58();
  const currentWallet = useRef(walletAddress);
  // Nothing starts chosen: choosing is the first step's whole question.
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [step, setStep] = useState(fixedTemplate || (initialAmount && initialSelected.length > 0) ? 1 : 0);
  const [typed, setTyped] = useState(initialAmount);
  const [weights, setWeights] = useState<Record<string, string> | undefined>(initialWeights);
  const [progress, setProgress] = useState<{ plan: string; changes: Record<string, Partial<Leg>> }>({ plan: "", changes: {} });
  const [now, setNow] = useState(() => Date.now());
  const [batchPhase, setBatchPhase] = useState<BatchPhase>("idle");
  const [batchProblem, setBatchProblem] = useState<BatchProblem>();
  const [processOpen, setProcessOpen] = useState(false);
  const [shortfall, setShortfall] = useState<string>();
  const [copied, setCopied] = useState(false);
  const allocationId = useRef<string | undefined>(undefined);

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
  const visible = needle === "" ? preferred : preferred.filter((lot) => lot.symbol.toLowerCase().includes(needle) || lot.name?.toLowerCase().includes(needle) || lot.issuer.toLowerCase().includes(needle));
  const chosen = preferred.filter((lot) => selected.includes(lot.mint));
  const chosenMints = chosen.map((lot) => lot.mint).join(",");
  const hiddenChosen = offered.filter((lot) => selected.includes(lot.mint)).length - chosen.length;
  // Whole percents only, so the split stays exact integer arithmetic.
  const weightOf = (mint: string) => (/^\d{1,3}$/.test(weights?.[mint]?.trim() ?? "") ? BigInt(weights![mint].trim()) : undefined);
  const chosenWeights = weights ? chosen.map((lot) => weightOf(lot.mint)) : undefined;
  const weightTotal = chosenWeights?.reduce<bigint>((sum, weight) => sum + (weight ?? 0n), 0n) ?? 100n;
  const weightProblem = !chosenWeights
    ? undefined
    : chosenWeights.some((weight) => weight === undefined || weight < 1n)
      ? "Give every constituent a whole-number weight of at least 1%."
      : weightTotal !== 100n
        ? `The weights add to ${weightTotal}%. They must add to 100%.`
        : undefined;
  const split =
    parsed && "atoms" in parsed && !weightProblem
      ? chosenWeights
        ? splitByWeights(parsed.atoms, chosenWeights as bigint[])
        : splitEvenly(parsed.atoms, chosen.length)
      : [];
  const overCapacity = split.findIndex((atoms, index) => atoms > lotCapAtoms(chosen[index]?.capacityUsdc ?? 0));
  const belowMinimum = split.findIndex((atoms) => atoms < minimumPlanAtoms(1));
  const amountProblem =
    parsed && "refused" in parsed
      ? parsed.refused
      : weightProblem
        ? weightProblem
      : parsed && "atoms" in parsed && chosen.length > 0 && parsed.atoms < minimumPlanAtoms(chosen.length)
        ? `Spend at least ${formatAmount(minimumPlanAtoms(chosen.length), USDC_SCALE)} USDC for ${chosen.length} ${chosen.length === 1 ? "constituent" : "constituents"}. The minimum is 1 USDC each.`
      : overCapacity >= 0
        ? `${chosen[overCapacity].symbol} may take at most ${formatAmount(BigInt(chosen[overCapacity].capacityUsdc), 0)} USDC under this captured capacity decision.`
        : belowMinimum >= 0
          ? `At these weights ${chosen[belowMinimum].symbol} would receive ${formatAmount(split[belowMinimum], USDC_SCALE)} USDC. Each constituent needs at least 1 USDC; raise the amount or its weight.`
          : undefined;

  // The plan is derived from the inputs on every render. Progress is kept as
  // each leg's changes, and only while it belongs to the same plan; the
  // inputs lock once a leg has started, so progress never lands on another.
  const plan = `${walletAddress ?? "no-wallet"}|${typed}|${chosen.map((lot) => `${lot.mint}:${weights?.[lot.mint] ?? "="}`).join(",")}`;
  const changes = progress.plan === plan ? progress.changes : {};
  const legs: Leg[] =
    amountProblem || split.length === 0
      ? []
      : chosen.map((lot, i) => ({ mint: lot.mint, symbol: lot.symbol, atoms: split[i], phase: "idle", ...changes[lot.mint] }));
  const started = legs.some((leg) => leg.phase !== "idle" || leg.note);
  // Holdings group a purchase under its basket only when it is that basket as
  // published: every constituent, equal weights. Anything else started from a
  // basket is a remix of it, and is named so rather than passed off as it.
  const asPublished = Boolean(template?.complete) && !weights &&
    initialSelected.length === chosen.length && initialSelected.every((mint) => chosen.some((lot) => lot.mint === mint));
  const identity = !template
    ? { name: "Custom allocation", templateId: undefined }
    : asPublished
      ? { name: template.name, templateId: template.id }
      : { name: `${template.name} remix`, templateId: undefined };

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
    keepUnsignedPlanInUrl({ mints: chosenMints ? chosenMints.split(",") : [], amount: typed, weights });
  }, [chosenMints, typed, weights, started]);

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

  const clearProgress = () => {
    setProgress({ plan: "", changes: {} });
    setBatchPhase("idle");
    setBatchProblem(undefined);
    setProcessOpen(false);
    allocationId.current = undefined;
  };

  const adjustAmount = () => {
    setShortfall(undefined);
    requestAnimationFrame(() => document.getElementById("allocation-usdc")?.focus());
  };

  const startOver = () => {
    clearProgress();
    setTyped("");
    keepUnsignedPlanInUrl({ mints: chosen.map((lot) => lot.mint), amount: "", weights });
    setStep(fixedTemplate ? 1 : 0);
  };

  const watch = useCallback(
    async (mint: string, signature: string, sentAt: string, blockhash?: string) => {
      // Watched until the leg lands, fails, or is declared dropped, which the
      // status route does once DROPPED_AFTER_MS has passed unseen; the attempt
      // cap only guards against a status route that never answers.
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          const query = new URLSearchParams({ signature, ...(walletAddress ? { wallet: walletAddress } : {}), mint, sent: sentAt, ...(blockhash ? { blockhash } : {}) });
          const response = await fetch(`/api/allocation/status?${query.toString()}`);
          const status = (await response.json()) as { state?: string; detail?: string; error?: string; tokenDeltaAtoms?: string; tokenDeltaScale?: number };
          if (status.state === "confirmed" || status.state === "finalized") {
            update(mint, { phase: "settled", note: `Settled, ${status.state} on mainnet.` });
            if (walletAddress && status.tokenDeltaAtoms && !status.tokenDeltaAtoms.startsWith("-") && status.tokenDeltaScale !== undefined) {
              patchLocalTrade(walletAddress, signature, {
                settled: true,
                settledAtoms: status.tokenDeltaAtoms,
                settledScale: status.tokenDeltaScale,
              });
            }
            return;
          }
          if (status.state === "failed") {
            update(mint, { phase: "failed", note: "Mainnet rejected this purchase. The network fee may have been charged. Review the transaction before trying again.", retryable: false });
            return;
          }
          if (status.state === "expired") {
            // Unseen past its blockhash, so it can never land: buying again is safe.
            update(mint, { phase: "failed", retryable: true, uncertain: false, note: "The network never included this purchase and it can no longer land. Nothing moved. Buy again prepares a fresh quote." });
            return;
          }
        } catch {
          // A missed poll is retried; the signature stays on screen either way.
        }
      }
      // Unconfirmed is not failed: the purchase may still land, so it is never
      // retried from this plan. Left in "sending", the Key read busy for good.
      update(mint, {
        phase: "failed",
        retryable: false,
        uncertain: true,
        note: "Mainnet status could not be read for six minutes. Check wallet activity and the signature below before buying this again.",
      });
    },
    [update, walletAddress],
  );

  // A submission error may arrive after broadcast. Never retry that leg from
  // the same plan without checking its on-chain state first.
  const walletBlocked = legs.some((leg) => leg.walletBlocked);
  const nextLeg = walletBlocked ? undefined : legs.find((leg) => leg.phase === "idle" || (leg.phase === "failed" && leg.retryable));
  const inFlight = legs.find((leg) => leg.phase === "preparing" || leg.phase === "signing" || leg.phase === "sending");
  const buying = useRef(false);

  const buyAll = async () => {
    const pending = legs.filter((leg) => leg.phase === "idle" || (leg.phase === "failed" && leg.retryable));
    if (!pending.length || !publicKey || (!signAllTransactions && !signTransaction) || inFlight || buying.current) return;
    buying.current = true;
    setBatchProblem(undefined);
    setProcessOpen(true);
    const signingWallet = walletAddress;
    if (!signingWallet) {
      buying.current = false;
      return;
    }
    const runId = allocationId.current ?? window.crypto.randomUUID();
    allocationId.current = runId;
    setBatchPhase("preflight");
    pending.forEach((leg) => update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined, signature: undefined, retryable: false, uncertain: false, walletBlocked: false }));

    let ready: { leg: Leg; prepared: PreparedLeg }[];
    try {
      const prepared = await postJson<PreparedLeg[]>("/api/allocation/prepare-batch", {
        wallet: signingWallet,
        legs: pending.map((leg) => ({ mint: leg.mint, usdcAtoms: leg.atoms.toString() })),
        planMints: chosen.map((lot) => lot.mint),
      });
      if (prepared.length !== pending.length) throw new Error("The Allocation preflight returned an incomplete plan.");
      ready = pending.map((leg, index) => ({ leg, prepared: prepared[index] }));
      ready.forEach(({ leg, prepared: item }) => update(leg.mint, { phase: "signing", prepared: item }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        // Not enough USDC or SOL: nothing was prepared, so no leg failed. The
        // reader is asked to fund the wallet or lower the amount instead.
        clearProgress();
        setShortfall(reasonFrom(error));
      } else {
        setBatchProblem(stoppedAllocation(0, error));
        pending.forEach((leg) => update(leg.mint, {
          phase: "failed",
          note: `${reasonFrom(error)} Nothing was signed, sent or spent.`,
          retryable: true,
        }));
      }
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
      setBatchProblem(stoppedAllocation(1, error));
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
    ready.forEach(({ leg, prepared }, index) => update(leg.mint, {
      phase: "sending",
      prepared,
      signature: bs58.encode(signed[index].signatures[0]),
      note: "Signed. Sending to mainnet.",
    }));

    await Promise.all(ready.map(async ({ leg, prepared }, index) => {
      try {
        const { signature } = await postJson<{ signature: string }>("/api/allocation/submit", {
          transaction: toBase64(signed[index].serialize()),
          approval: prepared.approval,
        });
        const submittedAt = new Date().toISOString();
        recordLocalTrade({
          signature,
          wallet: signingWallet,
          mint: leg.mint,
          symbol: leg.symbol,
          direction: "buy",
          inputAtoms: leg.atoms.toString(),
          inputScale: USDC_SCALE,
          submittedAt,
          allocationId: runId,
          allocationName: identity.name,
          allocationTemplateId: identity.templateId,
        });
        update(leg.mint, { signature, note: "Sent. Waiting for mainnet to confirm." });
        await watch(leg.mint, signature, submittedAt, prepared.blockhash);
      } catch (error) {
        const definitelyNotSent = error instanceof ApiError && error.sent === false;
        const changed = definitelyNotSent && error instanceof ApiError && error.code === "SIGNED_MESSAGE_CHANGED";
        if (definitelyNotSent) {
          update(leg.mint, {
            phase: "failed",
            signature: undefined,
            retryable: !changed,
            walletBlocked: changed,
            uncertain: false,
            note: changed ? "Not sent. The signed transaction no longer matched the approved plan." : `${reasonFrom(error)} Nothing moved; prepare this purchase again.`,
          });
          return;
        }
        const signature = bs58.encode(signed[index].signatures[0]);
        const submittedAt = new Date().toISOString();
        recordLocalTrade({
          signature,
          wallet: signingWallet,
          mint: leg.mint,
          symbol: leg.symbol,
          direction: "buy",
          inputAtoms: leg.atoms.toString(),
          inputScale: USDC_SCALE,
          submittedAt,
          allocationId: runId,
          allocationName: identity.name,
          allocationTemplateId: identity.templateId,
        });
        update(leg.mint, {
          phase: "sending",
          signature,
          retryable: false,
          uncertain: true,
          note: "The submit receipt was lost. Checking this signed transaction on mainnet before another attempt.",
        });
        await watch(leg.mint, signature, submittedAt, prepared.blockhash);
      }
    }));
    setBatchPhase("idle");
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
  const summaryLine = `${settledCount} of ${legs.length} ${legs.length === 1 ? "purchase" : "purchases"} settled.${walletBlocked ? " This wallet could not sign this purchase. The remaining purchases are paused." : uncertainCount ? ` ${uncertainCount} ${uncertainCount === 1 ? "submission needs" : "submissions need"} a wallet activity check.` : attempted.length === legs.length && settledCount < legs.length ? " The remaining purchases were not sent or did not settle." : ""}`;
  // The result opens as a centre dialog once every leg has ended, as Strike's
  // outcome does; the inline record below stays as the lasting account.
  const ended = (motionState === "success" || motionState === "partial" || motionState === "failure") && !inFlight && batchPhase === "idle" && attempted.length > 0;
  const running = batchPhase !== "idle" || Boolean(inFlight);
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
      {unavailable ? (
        <p className={styles.unavailable} role="note">
          {unavailable}
        </p>
      ) : null}

      {!fixedTemplate ? <StepTrack label="Allocation steps" steps={steps} current={step} onStep={(index) => !started && setStep(index)} /> : null}

      <div className={styles.workspace}>
        <div className={styles.builder}>
          {step === 0 && !fixedTemplate ? (
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
                              <small className={styles.lotMeta} title={[lot.name, lot.issuer].filter(Boolean).join(" · ")}>
                                {lot.name ? <span>{lot.name}</span> : null}
                                <span>{lot.issuer}</span>
                              </small>
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
                                keepUnsignedPlanInUrl({ mints: preferred.filter((entry) => next.includes(entry.mint)).map((entry) => entry.mint), amount: typed, weights });
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
            <section className={styles.section} aria-label="Set the allocation amount">
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
                message={amountProblem ?? (legs.length === 0 ? (weights ? "Seametry divides one total by the weights you set." : "Seametry divides one total evenly across what you chose.") : weights ? describeWeightedSplit(legs) : describeSplit(legs, USDC_SCALE, "USDC"))}
                onChange={(event) => {
                  setTyped(event.target.value);
                  keepUnsignedPlanInUrl({ mints: chosen.map((lot) => lot.mint), amount: event.target.value, weights });
                }}
              />
              {!fixedTemplate && chosen.length > 1 ? (
                <fieldset className={styles.weighting} disabled={started}>
                  <legend>Weighting</legend>
                  <div className={styles.weightingModes}>
                    <label>
                      <input type="radio" name="weighting" checked={!weights} onChange={() => setWeights(undefined)} />
                      <span>Equal</span>
                    </label>
                    <label>
                      <input type="radio" name="weighting" checked={Boolean(weights)} onChange={() => setWeights(evenWeights(chosen.map((lot) => lot.mint)))} />
                      <span>Custom weights</span>
                    </label>
                  </div>
                  {weights ? (
                    <>
                      <ol className={styles.weightRows}>
                        {chosen.map((lot) => (
                          <li key={lot.mint}>
                            <LotMark symbol={lot.symbol} src={lot.logo} />
                            <label htmlFor={`weight-${lot.mint}`}>{lot.symbol}</label>
                            <span className={styles.weightInput}>
                              <input
                                id={`weight-${lot.mint}`}
                                inputMode="numeric"
                                autoComplete="off"
                                value={weights[lot.mint] ?? ""}
                                aria-invalid={weightOf(lot.mint) === undefined || weightOf(lot.mint)! < 1n}
                                onChange={(event) => setWeights({ ...weights, [lot.mint]: event.target.value })}
                              />
                              <span aria-hidden="true">%</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p className={styles.weightTotal} data-complete={weightTotal === 100n || undefined}>
                        {weightTotal.toString()}% of 100% assigned
                      </p>
                    </>
                  ) : null}
                </fieldset>
              ) : null}
            </section>
          ) : null}

          {step === 1 && legs.length > 0 ? (
            <>
              {/* On a phone the order sheet is not beside the steps, so the
                  step where signing happens carries it. */}
              <div className={styles.orderInline} data-testid="order-sheet-inline">{orderSummary}</div>
              <section className={styles.section} aria-label="Buy allocation">
                {motionState !== "idle" ? <AllocationMotion state={motionState} total={legs.length} settled={settledCount} legs={legs.map((leg) => ({ symbol: leg.symbol, phase: leg.phase }))} /> : null}
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
                                ...(leg.prepared.solNeededLamports ? [{ label: "SOL needed, including account opening", value: `${formatAmount(leg.prepared.solNeededLamports, 9)} SOL` }] : []),
                                { label: "Venue fees", value: "Included in the expected output" },
                              ]}
                              route={`Jupiter, through ${leg.prepared.route.join(", ")}, quoted at slot ${leg.prepared.contextSlot}`}
                              received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(leg.prepared.receivedAt)) / 1000))}s`, absolute: leg.prepared.receivedAt }}
                              secondsLeft={secondsLeft}
                            />
                            <p className={styles.simulated}>
                              Simulated token changes on mainnet for this wallet:{" "}
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
                  <p className={styles.summary} role={uncertainCount ? "alert" : "status"}>{summaryLine}</p>
                ) : null}
                {settledCount > 0 ? <Link href="/app/positions" className={styles.holdingsLink}>View holdings and sell</Link> : null}
                {running && !processOpen ? <QuietAction onClick={() => setProcessOpen(true)}>View purchase progress</QuietAction> : null}
                {started && !running && !walletBlocked ? <QuietAction onClick={startOver}>Start new allocation</QuietAction> : null}
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
          back={fixedTemplate ? undefined : (
            <QuietAction icon="back" disabled={Boolean(backReason)} title={backReason} onClick={() => setStep(0)}>
              Back
            </QuietAction>
          )}
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
                disabledReason={keyDisabledReason}
                onClick={() => void buyAll()}
              >
                {fixedTemplate ? "Buy basket" : "Buy allocation"}
              </Key>
            ) : (
              <span>{uncertainCount ? "Check wallet activity" : settledCount === legs.length ? "Purchases settled" : "Review purchase status"}</span>
            )
          }
        />
      )}
      {(running || ended || Boolean(batchProblem)) && processOpen ? (
        <ProcessDialog
          open
          onClose={() => setProcessOpen(false)}
          title={running ? "Buying allocation" : motionState === "success" ? "Allocation assembled" : motionState === "partial" ? "Allocation partly assembled" : "Purchase stopped"}
          register="Mainnet"
          closeLabel="Close allocation status"
          footer={ended ? <>
            {settledCount > 0 ? <RouteAction href="/app/positions">View holdings and sell</RouteAction> : null}
            {!walletBlocked ? <QuietAction type="button" onClick={startOver}>Start new allocation</QuietAction> : null}
          </> : undefined}
        >
          {batchProblem ? <StepRegister label="Allocation progress" steps={allocationSteps("idle", batchProblem)} /> : running ? <StepRegister label="Allocation progress" steps={allocationSteps(batchPhase === "idle" ? "settling" : batchPhase)} /> : <ProcessOutcome kind={motionState === "success" ? "success" : "error"} title={summaryLine}>
            <ul className={styles.outcomeLegs} aria-label="Purchases">
              {legs.map((leg) => (
                <li key={leg.mint}>
                  <b>{leg.symbol}</b>
                  <span>{leg.walletBlocked ? "Not sent" : leg.phase === "failed" && leg.retryable ? "Prepare again" : leg.uncertain ? "Check wallet" : phaseLabel[leg.phase]}</span>
                  {leg.signature ? <a href={`https://explorer.solana.com/tx/${leg.signature}`} rel="noreferrer" target="_blank">{leg.signature.slice(0, 8)}…</a> : null}
                </li>
              ))}
            </ul>
          </ProcessOutcome>}
        </ProcessDialog>
      ) : null}
      <ProcessDialog
        open={Boolean(shortfall)}
        onClose={() => setShortfall(undefined)}
        title="Fund the wallet or lower the amount"
        register="Nothing was signed"
        closeLabel="Close"
        footer={<>
          <QuietAction type="button" icon="wallet" onClick={() => {
            if (!walletAddress) return;
            void navigator.clipboard.writeText(walletAddress).then(() => setCopied(true));
          }}>{copied ? "Wallet address copied" : "Copy wallet address"}</QuietAction>
          <ContinueAction type="button" onClick={adjustAmount}>Adjust amount</ContinueAction>
        </>}
      >
        <p>{shortfall}</p>
        <p>Send USDC or SOL to {walletAddress ? <b>{walletAddress}</b> : "this wallet"} and buy again, or lower the amount so it fits what the wallet holds. Seametry prepared nothing and nothing left the wallet.</p>
      </ProcessDialog>
    </div>
  );
}
