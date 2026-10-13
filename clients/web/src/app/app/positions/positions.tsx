"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ContinueAction, Field, Key, LotMark, QuietAction, QuoteBlock, StepRegister, StepTrack } from "@seametry/ui";
import { ModalSheet, ProcessDialog, ProcessOutcome } from "@seametry/ui/modal-sheet";
import { formatAmount, formatBalance, parseAmount } from "@/lib/amount";
import { forgetLocalTrade, patchLocalTrade, readLocalTrades, readTrackedAllocations, recordLocalTrade, signedSignature, type LocalTrade, type TrackedAllocation } from "@/lib/allocation/activity";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { ListedPosition } from "@/lib/allocation/positions";
import { logoFor } from "@/lib/instrument-logos";
import { AllocationMotion, type AllocationMotionState } from "../allocation/allocation-motion";
import styles from "./positions.module.css";

type Reading = { wallet: string; network: "mainnet"; source: string; observedAt: string; positions: ListedPosition[]; outsideRegister: number };
type TradeState = "idle" | "preparing" | "review" | "signing" | "checking" | "settled" | "failed" | "expired" | "unavailable";
type ActivityStatus = { signature: string; state: string; detail?: string };
type BatchSaleState = "idle" | "preparing" | "review" | "signing" | "checking" | "success" | "partial" | "failed";
type BatchSaleLeg = { mint: string; symbol: string; atoms: string; scale: number; prepared?: PreparedLeg };

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `The request returned ${response.status}.`);
  return body as T;
}

export function Positions() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const wallet = publicKey?.toBase58();
  const [reading, setReading] = useState<Reading>();
  const [readingProblem, setReadingProblem] = useState<string>();
  const [readingBusy, setReadingBusy] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string>();
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("sell");
  // The sale runs in three places, as Strike does: a stepped sheet to set
  // the amount and review terms, then a centre dialog while it signs and
  // confirms, then a centre outcome. attempt holds from Sign sale until the
  // outcome is closed; progressHidden lets the reader dismiss the wait.
  const [tradeStep, setTradeStep] = useState(0);
  const [saleSheetOpen, setSaleSheetOpen] = useState(false);
  const [attempt, setAttempt] = useState(false);
  const [progressHidden, setProgressHidden] = useState(false);
  const [amount, setAmount] = useState("");
  const [prepared, setPrepared] = useState<PreparedLeg>();
  const [tradeState, setTradeState] = useState<TradeState>("idle");
  const [tradeProblem, setTradeProblem] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [activity, setActivity] = useState<LocalTrade[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ActivityStatus>>({});
  const [now, setNow] = useState(() => Date.now());
  const [allocations, setAllocations] = useState<TrackedAllocation[]>([]);
  const [selectedAllocation, setSelectedAllocation] = useState<TrackedAllocation>();
  const [batchSaleState, setBatchSaleState] = useState<BatchSaleState>("idle");
  const [batchSaleLegs, setBatchSaleLegs] = useState<BatchSaleLeg[]>([]);
  const [batchSaleProblem, setBatchSaleProblem] = useState<string>();
  const [batchSaleSignatures, setBatchSaleSignatures] = useState<string[]>([]);

  const refresh = useCallback(async (address: string) => {
    setReadingBusy(true);
    setReadingProblem(undefined);
    try {
      const response = await fetch(`/api/allocation/positions?wallet=${encodeURIComponent(address)}`, { cache: "no-store" });
      const next = await responseJson<Reading>(response);
      if (next.wallet === address) setReading(next);
    } catch (error) {
      setReadingProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setReadingBusy(false);
    }
  }, []);

  const check = useCallback(async (entry: LocalTrade) => {
    try {
      const query = new URLSearchParams({ signature: entry.signature, wallet: entry.wallet, mint: entry.mint, sent: entry.submittedAt });
      const response = await fetch("/api/allocation/status?" + query.toString(), { cache: "no-store" });
      const status = await responseJson<{ state: string; detail?: string; tokenDeltaAtoms?: string; tokenDeltaScale?: number }>(response);
      setStatuses((current) => ({ ...current, [entry.signature]: { signature: entry.signature, ...status } }));
      if (status.state === "confirmed" || status.state === "finalized") {
        if (entry.direction === "sell") {
          patchLocalTrade(entry.wallet, entry.signature, { settled: true });
        } else if (status.tokenDeltaAtoms && !status.tokenDeltaAtoms.startsWith("-") && status.tokenDeltaScale !== undefined) {
          patchLocalTrade(entry.wallet, entry.signature, {
            settled: true,
            settledAtoms: status.tokenDeltaAtoms,
            settledScale: status.tokenDeltaScale,
          });
        }
        if (wallet === entry.wallet) {
          setActivity(readLocalTrades(wallet));
          setAllocations(readTrackedAllocations(wallet));
        }
      }
      if (entry.signature === signature && (status.state === "confirmed" || status.state === "finalized")) {
        setTradeState("settled");
        if (wallet) void refresh(wallet);
      }
      if (entry.signature === signature && status.state === "failed") {
        setTradeState("failed");
        setTradeProblem(status.detail ?? "Mainnet rejected this sale. Read the transaction before another attempt.");
      }
      if (entry.signature === signature && status.state === "expired") setTradeState("expired");
    } catch (error) {
      setStatuses((current) => ({ ...current, [entry.signature]: { signature: entry.signature, state: "unavailable", detail: error instanceof Error ? error.message : String(error) } }));
      if (entry.signature === signature) {
        setTradeState("unavailable");
        setTradeProblem("Mainnet status could not be read. Check the transaction before another sale.");
      }
    }
  }, [refresh, signature, wallet]);

  useEffect(() => {
    if (!wallet) return;
    void refresh(wallet);
    const stored = readLocalTrades(wallet);
    setActivity(stored);
    setAllocations(readTrackedAllocations(wallet));
    stored.forEach((entry) => { void check(entry); });
  }, [wallet, refresh, check]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!signature || tradeState !== "checking") return;
    const entry = activity.find((item) => item.signature === signature);
    if (!entry) return;
    const timer = setInterval(() => { void check(entry); }, 3000);
    return () => clearInterval(timer);
  }, [activity, check, signature, tradeState]);

  useEffect(() => {
    if (!wallet) return;
    const pending = activity.filter((entry) => {
      const state = statuses[entry.signature]?.state;
      return state !== "confirmed" && state !== "finalized" && state !== "failed" && state !== "expired";
    });
    if (pending.length === 0) return;
    const timer = setInterval(() => pending.forEach((entry) => { void check(entry); }), 3000);
    return () => clearInterval(timer);
  }, [activity, check, statuses, wallet]);

  useEffect(() => {
    if (batchSaleState !== "checking" || batchSaleSignatures.length === 0) return;
    const states = batchSaleSignatures.map((id) => statuses[id]?.state);
    if (states.some((state) => !state || state === "pending" || state === "unavailable")) return;
    const settled = states.filter((state) => state === "confirmed" || state === "finalized").length;
    if (settled === states.length) setBatchSaleState("success");
    else if (settled > 0) setBatchSaleState("partial");
    else setBatchSaleState("failed");
  }, [batchSaleSignatures, batchSaleState, statuses]);

  const allocationSaleLegs = (allocation: TrackedAllocation): BatchSaleLeg[] => {
    if (!reading || reading.wallet !== wallet) return [];
    return allocation.legs.map((leg) => {
      const held = reading.positions.find((position) => position.mint === leg.mint);
      const available = BigInt(held?.sellableAtoms ?? "0");
      const tracked = BigInt(leg.atoms);
      const atoms = tracked < available ? tracked : available;
      return { mint: leg.mint, symbol: leg.symbol, atoms: atoms.toString(), scale: leg.scale };
    }).filter((leg) => BigInt(leg.atoms) > 0n);
  };

  function openAllocationSale(allocation: TrackedAllocation) {
    setSelectedAllocation(allocation);
    setBatchSaleLegs(allocationSaleLegs(allocation));
    setBatchSaleState("idle");
    setBatchSaleProblem(undefined);
    setBatchSaleSignatures([]);
  }

  async function prepareAllocationSale() {
    if (!wallet || !selectedAllocation) return;
    const legs = allocationSaleLegs(selectedAllocation);
    if (legs.length === 0) {
      setBatchSaleProblem("None of the tracked Allocation quantities remain available to this route.");
      setBatchSaleState("failed");
      return;
    }
    setBatchSaleState("preparing");
    setBatchSaleProblem(undefined);
    try {
      const prepared = await Promise.all(legs.map(async (leg) => {
        const response = await fetch("/api/allocation/sell/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wallet, mint: leg.mint, atoms: leg.atoms }),
        });
        return { ...leg, prepared: await responseJson<PreparedLeg>(response) };
      }));
      setBatchSaleLegs(prepared);
      setBatchSaleState("review");
    } catch (error) {
      setBatchSaleProblem(error instanceof Error ? error.message : String(error));
      setBatchSaleState("failed");
    }
  }

  async function signAllocationSale() {
    if (!wallet || !selectedAllocation || batchSaleLegs.length === 0 || batchSaleLegs.some((leg) => !leg.prepared) || (!signAllTransactions && !signTransaction)) return;
    setBatchSaleState("signing");
    setBatchSaleProblem(undefined);
    const originals = batchSaleLegs.map((leg) => VersionedTransaction.deserialize(fromBase64(leg.prepared!.transaction)));
    const before = originals.map((transaction) => transaction.message.serialize().slice());

    let signed: VersionedTransaction[];
    try {
      if (signAllTransactions) signed = await signAllTransactions(originals);
      else {
        signed = [];
        for (const transaction of originals) signed.push(await signTransaction!(transaction));
      }
      const changed = signed.findIndex((transaction, index) => {
        const after = transaction.message.serialize();
        return before[index].length !== after.length || before[index].some((byte, offset) => byte !== after[offset]);
      });
      if (changed >= 0) throw new Error("The wallet changed one of the checked sale transactions. Nothing was sent.");
      if (publicKey?.toBase58() !== wallet) throw new Error("The connected wallet changed before submission. Nothing was sent.");
    } catch (error) {
      setBatchSaleProblem(error instanceof Error ? error.message : String(error));
      setBatchSaleState("failed");
      return;
    }

    const submitted: string[] = [];
    setBatchSaleState("checking");
    for (let index = 0; index < batchSaleLegs.length; index += 1) {
      const leg = batchSaleLegs[index];
      const prepared = leg.prepared!;
      // A wallet can hand back a leg it did not sign. Uncaught here, that
      // stalled the whole exit in "checking" with no message; the leg is now
      // named and skipped, and nothing is sent for it.
      let signedId: string;
      try {
        signedId = signedSignature(signed[index].signatures[0]);
      } catch {
        setBatchSaleProblem(`The wallet returned the ${leg.symbol} sale without a signature. Nothing was sent for ${leg.symbol}.`);
        continue;
      }
      const entry: LocalTrade = {
        signature: signedId,
        wallet,
        mint: leg.mint,
        symbol: leg.symbol,
        direction: "sell",
        inputAtoms: leg.atoms,
        inputScale: leg.scale,
        submittedAt: new Date().toISOString(),
        allocationId: selectedAllocation.id,
        allocationName: selectedAllocation.name,
        allocationTemplateId: selectedAllocation.templateId,
      };
      recordLocalTrade(entry);
      try {
        const response = await fetch("/api/allocation/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transaction: toBase64(signed[index].serialize()), approval: prepared.approval }),
        });
        if ([400, 409, 410, 451, 503].includes(response.status)) {
          const body = await response.json() as { error?: string };
          forgetLocalTrade(signedId);
          throw new Error(body.error ?? "Seametry refused a sale before sending it.");
        }
        const sent = await responseJson<{ signature: string }>(response);
        if (sent.signature !== signedId) throw new Error("The server returned a different transaction signature.");
        submitted.push(signedId);
        void check(entry);
      } catch (error) {
        const stillTracked = readLocalTrades(wallet).some((trade) => trade.signature === signedId);
        if (stillTracked) {
          submitted.push(signedId);
          void check(entry);
        }
        setBatchSaleProblem("At least one signed sale could not be verified. Check the transaction list before another exit. " + (error instanceof Error ? error.message : String(error)));
      }
    }
    setActivity(readLocalTrades(wallet));
    setBatchSaleSignatures(submitted);
    if (submitted.length === 0) setBatchSaleState("failed");
  }

  const position = reading && reading.wallet === wallet ? reading.positions.find((item) => item.mint === selectedMint) : undefined;
  const currentTrade = activity.find((entry) => entry.signature === signature);
  const parsed = position && amount ? parseAmount(amount, position.scale) : undefined;
  const amountProblem = parsed && "refused" in parsed ? parsed.refused : parsed && "atoms" in parsed && parsed.atoms > BigInt(position!.sellableAtoms) ? `The associated token account holds ${formatAmount(position!.sellableAtoms, position!.scale)} ${position!.symbol} available to this route.` : undefined;
  const validAtoms = parsed && "atoms" in parsed && parsed.atoms > 0n && !amountProblem ? parsed.atoms : undefined;
  const remaining = prepared ? Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - now) / 1000)) : 0;

  function openTrade(mint: string) {
    setSelectedMint(mint);
    setTradeTab("sell");
    setAmount("");
    resetSale();
    setSaleSheetOpen(true);
  }

  /** Back to the amount step with the amount kept, for a fresh quote after a sale that did not complete. */
  function sellAgain() {
    resetSale();
    setSaleSheetOpen(true);
  }

  function resetSale() {
    setPrepared(undefined);
    setTradeState("idle");
    setTradeProblem(undefined);
    setSignature(undefined);
    setTradeStep(0);
    setAttempt(false);
  }

  function fillAvailable(percent: bigint) {
    if (!position) return;
    setAmount(formatBalance(BigInt(position.sellableAtoms) * percent / 100n, position.scale));
    setPrepared(undefined);
    setTradeState("idle");
    setTradeProblem(undefined);
    setSignature(undefined);
  }

  async function prepare() {
    if (!wallet || !position || !validAtoms) return;
    setTradeState("preparing");
    setTradeProblem(undefined);
    setPrepared(undefined);
    try {
      const response = await fetch("/api/allocation/sell/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, mint: position.mint, atoms: validAtoms.toString() }) });
      setPrepared(await responseJson<PreparedLeg>(response));
      setTradeState("review");
      setTradeStep(1);
    } catch (error) {
      setTradeState("unavailable");
      setTradeProblem(error instanceof Error ? error.message : String(error));
    }
  }

  async function signSale() {
    if (!wallet || !position || !prepared || !signTransaction || remaining === 0) return;
    setTradeState("signing");
    setTradeProblem(undefined);
    setSaleSheetOpen(false);
    setAttempt(true);
    setProgressHidden(false);
    let signedId: string | undefined;
    try {
      const original = VersionedTransaction.deserialize(fromBase64(prepared.transaction));
      const message = original.message.serialize();
      const signed = await signTransaction(original);
      const after = signed.message.serialize();
      if (message.length !== after.length || message.some((byte, index) => byte !== after[index])) throw new Error("The wallet changed the checked transaction. Nothing was sent. Review a new sale quote before trying again.");
      if (publicKey?.toBase58() !== wallet) throw new Error("The connected wallet changed before submission. Nothing was sent.");
      signedId = signedSignature(signed.signatures[0]);
      const entry: LocalTrade = { signature: signedId, wallet, mint: position.mint, symbol: position.symbol, direction: "sell", inputAtoms: prepared.inAtoms, inputScale: position.scale, submittedAt: new Date().toISOString() };
      recordLocalTrade(entry);
      setActivity(readLocalTrades(wallet));
      setSignature(signedId);
      setTradeState("checking");
      setPrepared(undefined);
      const response = await fetch("/api/allocation/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction: toBase64(signed.serialize()), approval: prepared.approval }) });
      if ([400, 409, 410, 451, 503].includes(response.status)) {
        const body = await response.json() as { error?: string };
        forgetLocalTrade(signedId);
        setActivity(readLocalTrades(wallet));
        setSignature(undefined);
        signedId = undefined;
        throw new Error(body.error ?? "Seametry refused this sale before sending it. Request current terms.");
      }
      const sent = await responseJson<{ signature: string }>(response);
      if (sent.signature !== signedId) throw new Error("The server returned a different transaction signature. Check the signed transaction on mainnet before another sale.");
    } catch (error) {
      setTradeState(signedId ? "checking" : "unavailable");
      setTradeProblem(signedId ? `Seametry could not verify submission. Check the signed transaction below before another sale. ${error instanceof Error ? error.message : String(error)}` : error instanceof Error ? error.message : String(error));
      setPrepared(undefined);
    }
  }

  return (
    <div className={styles.workspace}>
      {!wallet ? <p className={styles.notice}>Connect the wallet that holds your instruments. Connecting buys or sells nothing.</p> : (
        <>
          {allocations.length > 0 ? (
            <section className={styles.allocations} aria-labelledby="allocations-title">
              <header className={styles.sectionHead}>
                <div>
                  <h2 id="allocations-title">Your Allocations</h2>
                  <p>Device-local grouping of confirmed Seametry purchases. Current wallet balances remain the authority.</p>
                </div>
              </header>
              <div className={styles.allocationCards}>
                {allocations.map((allocation) => (
                  <article key={allocation.id} className={styles.allocationCard}>
                    <div>
                      <span>{allocation.templateId ? "Published-rule Allocation" : "Custom Allocation"}</span>
                      <h3>{allocation.name}</h3>
                      <p>{allocation.legs.length} tracked constituents · opened {new Date(allocation.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className={styles.allocationLegs}>
                      {allocation.legs.map((leg) => <b key={leg.mint}>{leg.symbol} <small>{formatBalance(leg.atoms, leg.scale)}</small></b>)}
                    </div>
                    <QuietAction type="button" onClick={() => openAllocationSale(allocation)}>Sell allocation</QuietAction>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className={styles.ledger} aria-labelledby="holdings-title">
            <header className={styles.sectionHead}>
              <div><h2 id="holdings-title">In this wallet</h2><p>Solana mainnet RPC. {reading?.wallet === wallet ? `Observed ${new Date(reading.observedAt).toLocaleString()}.` : "No observation yet."}</p><p>Total portfolio value: no price observation. Balances below are exact token quantities, not a sum in USDC.</p></div>
              <QuietAction type="button" onClick={() => void refresh(wallet)} disabled={readingBusy}>Refresh holdings</QuietAction>
            </header>
            {readingBusy && !reading ? <p className={styles.notice}>Reading mainnet token accounts for this wallet.</p> : null}
            {readingProblem ? <p className={styles.problem} role="alert">{readingProblem}</p> : null}
            {reading?.wallet === wallet && reading.positions.length === 0 ? <p className={styles.notice}>This wallet holds no instruments from the Seametry register. Other wallet tokens are not shown here.</p> : null}
            {reading?.wallet === wallet ? (
              <ul className={styles.holdings}>
                {reading.positions.map((item) => <li key={item.mint}>
                  <LotMark symbol={item.symbol} src={logoFor(item.mint)} />
                  <div className={styles.identity}><b>{item.symbol}</b><span>{formatBalance(item.atoms, item.scale)} held{item.atoms !== item.sellableAtoms ? `; ${formatBalance(item.sellableAtoms, item.scale)} available to this route` : ""}</span></div>
                  <QuietAction type="button" onClick={() => openTrade(item.mint)}>Sell {item.symbol}</QuietAction>
                </li>)}
              </ul>
            ) : null}
            {reading?.wallet === wallet && reading.outsideRegister > 0 ? <p className={styles.notice}>This wallet also holds tokens outside this register. They are not included in these rows.</p> : null}
          </section>

          <ModalSheet
            open={Boolean(selectedAllocation)}
            onClose={() => setSelectedAllocation(undefined)}
            title={selectedAllocation ? "Sell " + selectedAllocation.name : "Sell Allocation"}
            register="Mainnet"
            closeLabel="Close Allocation exit"
            footer={selectedAllocation ? (
              batchSaleState === "review"
                ? <Key type="button" onClick={() => void signAllocationSale()} disabled={!signAllTransactions && !signTransaction} disabledReason="This wallet cannot sign transactions in this browser. Open Seametry in the wallet's own browser or connect another wallet.">Approve sell all</Key>
                : batchSaleState === "preparing" || batchSaleState === "signing" || batchSaleState === "checking" || batchSaleState === "success"
                  ? undefined
                  : <Key type="button" onClick={() => void prepareAllocationSale()} disabled={batchSaleLegs.length === 0} disabledReason="Nothing in this Allocation can be sold from this wallet right now.">Review sell all</Key>
            ) : undefined}
          >
            {selectedAllocation ? (
              <div className={styles.batchSale}>
                {batchSaleState !== "idle" ? (
                  <AllocationMotion
                    mode="sell"
                    state={(
                      batchSaleState === "preparing" ? "preflight" :
                      batchSaleState === "review" || batchSaleState === "signing" ? "approval" :
                      batchSaleState === "checking" ? "settling" :
                      batchSaleState === "success" ? "success" :
                      batchSaleState === "partial" ? "partial" :
                      batchSaleState === "failed" ? "failure" : "idle"
                    ) as AllocationMotionState}
                    total={batchSaleLegs.length}
                    settled={batchSaleSignatures.filter((id) => ["confirmed", "finalized"].includes(statuses[id]?.state ?? "")).length}
                    legs={batchSaleLegs.map((leg) => {
                      const submitted = activity.find((entry) => entry.mint === leg.mint && entry.direction === "sell" && batchSaleSignatures.includes(entry.signature));
                      const status = submitted ? statuses[submitted.signature]?.state : undefined;
                      const phase = status === "confirmed" || status === "finalized" ? "settled"
                        : status === "failed" ? "failed"
                        : submitted ? "sending"
                        : batchSaleState === "failed" ? "failed"
                        : batchSaleState === "preparing" ? "preparing"
                        : batchSaleState === "signing" ? "signing" : "idle";
                      return { symbol: leg.symbol, phase } as const;
                    })}
                  />
                ) : null}
                <p className={styles.notice}>Sell All exits only the quantities attributed to this Allocation, capped by what the connected wallet still holds.</p>
                <ol className={styles.batchSaleLegs}>
                  {batchSaleLegs.map((leg) => (
                    <li key={leg.mint}>
                      <div><b>{leg.symbol}</b><span>{formatBalance(leg.atoms, leg.scale)} to sell</span></div>
                      {leg.prepared ? <div><strong>{formatAmount(leg.prepared.outAtoms, 6)} USDC</strong><small>expected · floor {formatAmount(leg.prepared.floorAtoms, 6)}</small></div> : null}
                    </li>
                  ))}
                </ol>
                {batchSaleProblem ? <p className={styles.problem} role="alert">{batchSaleProblem}</p> : null}
                {batchSaleSignatures.length > 0 ? (
                  <div className={styles.batchSignatures}>
                    {batchSaleSignatures.map((id) => <a key={id} href={"https://explorer.solana.com/tx/" + id} target="_blank" rel="noreferrer">{statuses[id]?.state === "expired" ? "not landed, nothing moved" : statuses[id]?.state ?? "pending"} · {id.slice(0, 8)}…</a>)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </ModalSheet>

          <ModalSheet
            open={Boolean(position) && saleSheetOpen}
            onClose={() => setSaleSheetOpen(false)}
            title={`Trade ${position?.symbol ?? "instrument"}`}
            register="Mainnet"
            closeLabel="Close trade sheet"
            footer={position ? tradeTab === "buy" ? (
              <Link className={styles.sheetLink} href={`/app/baskets/build?add=${encodeURIComponent(position.mint)}`}>Buy {position.symbol}</Link>
            ) : tradeStep === 0 ? (
              <Key type="button" onClick={() => void prepare()} disabled={!validAtoms || tradeState === "preparing" || !signTransaction} busy={tradeState === "preparing"} busyLabel="Checking sale" disabledReason={!signTransaction ? "This wallet cannot sign transactions in this browser." : !validAtoms ? "Enter an amount to sell, up to what this route can take." : undefined}>Review sale</Key>
            ) : remaining === 0 ? (
              <ContinueAction type="button" onClick={() => void prepare()}>Request current terms</ContinueAction>
            ) : (
              <Key type="button" onClick={() => void signSale()}>Sign sale</Key>
            ) : undefined}
          >
            {position ? <div className={styles.sale}>
            {tradeStep === 0 ? <div className={styles.tradeTabs} role="tablist" aria-label="Trade direction">
              <button type="button" role="tab" aria-selected={tradeTab === "buy"} onClick={() => setTradeTab("buy")}>Buy</button>
              <button type="button" role="tab" aria-selected={tradeTab === "sell"} onClick={() => setTradeTab("sell")}>Sell</button>
            </div> : null}
            {tradeTab === "buy" ? <div className={styles.tradePanel} role="tabpanel"><p>Buy {position.symbol} into this wallet through an Allocation. The purchase receives a fresh mainnet quote before signing.</p></div> : <div className={styles.tradePanel} role="tabpanel">
            <StepTrack label="Sale steps" steps={["Amount", "Review"]} current={tradeStep} onStep={(index) => { if (index === 0) { setTradeStep(0); setPrepared(undefined); setTradeState("idle"); } }} />
            {tradeStep === 0 ? <>
              <p>A market swap into USDC. This is not issuer redemption or an Alloy Melt.</p>
              <Field id="sale-amount" label={`Amount of ${position.symbol} to sell`} inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setPrepared(undefined); setTradeState("idle"); setTradeProblem(undefined); setSignature(undefined); }} message={amountProblem ?? `Available to this route: ${formatAmount(position.sellableAtoms, position.scale)} ${position.symbol}, observed ${new Date(reading!.observedAt).toLocaleString()}.`} invalid={Boolean(amountProblem)} />
              <div className={styles.amountShortcuts}>
                <QuietAction type="button" onClick={() => fillAvailable(25n)} disabled={position.sellableAtoms === "0"}>Use 25%</QuietAction>
                <QuietAction type="button" onClick={() => fillAvailable(50n)} disabled={position.sellableAtoms === "0"}>Use 50%</QuietAction>
                <QuietAction type="button" onClick={() => fillAvailable(100n)} disabled={position.sellableAtoms === "0"}>Use available balance</QuietAction>
              </div>
            </> : prepared ? <div className={styles.quote}>
              <QuoteBlock floor={formatAmount(prepared.floorAtoms, 6)} expected={formatAmount(prepared.outAtoms, 6)} unit="USDC" fees={[{ label: `Seametry routing fee, ${formatAmount(BigInt(prepared.routingFeeBps), 2)}%`, value: `${formatAmount(prepared.routingFeeAtoms, 6)} USDC` }, { label: "Priority fee set by the route", value: `${formatAmount(prepared.priorityFeeLamports, 9)} SOL` }, { label: "Venue fees", value: "Included in expected output" }]} route={`Jupiter through ${prepared.route.join(", ")}, slot ${prepared.contextSlot}`} received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(prepared.receivedAt)) / 1000))}s`, absolute: prepared.receivedAt }} secondsLeft={remaining} />
              <p>Simulated on mainnet for this wallet: {prepared.simulated.map((change) => `${change.atoms.startsWith("-") ? "" : "+"}${formatAmount(change.atoms, change.scale)} ${change.unit}`).join("; ")}.</p>
            </div> : null}
            {tradeProblem && !attempt ? <p className={styles.problem} role="alert">{tradeProblem}</p> : null}
            </div>}
          </div> : null}
          </ModalSheet>

          {position && attempt && !progressHidden && (tradeState === "signing" || tradeState === "checking") ? (
            <ProcessDialog open onClose={() => setProgressHidden(true)} title={`Sell ${position.symbol}`} register="Mainnet" closeLabel="Hide sale progress">
              <StepRegister label={`Sell ${position.symbol}`} steps={[
                { title: "Sign the sale in your wallet", glyph: "wallet", state: tradeState === "signing" ? "now" : "done", note: "Approve the sale in your wallet" },
                { title: "Submit and confirm on mainnet", glyph: "confirm", state: tradeState === "checking" ? "now" : "waiting", note: tradeProblem ?? "Waiting for mainnet; a sale the network never includes is called after five minutes" },
              ]} />
            </ProcessDialog>
          ) : null}
          {position && attempt && (tradeState === "settled" || tradeState === "failed" || tradeState === "expired" || tradeState === "unavailable") ? (
            <ProcessDialog
              open
              onClose={() => setAttempt(false)}
              title={tradeState === "settled" ? "Sale settled" : tradeState === "failed" ? "Sale failed" : tradeState === "expired" ? "Sale did not land" : signature ? "Check the transaction" : "Sale stopped"}
              register="Mainnet"
              closeLabel="Close sale outcome"
              footer={tradeState === "settled" ? undefined : tradeState === "unavailable" && signature && currentTrade
                ? <QuietAction type="button" onClick={() => void check(currentTrade)}>Check status</QuietAction>
                : <ContinueAction type="button" onClick={sellAgain}>Sell again</ContinueAction>}
            >
              <ProcessOutcome kind={tradeState === "settled" ? "success" : tradeState === "unavailable" && signature ? "pending" : "error"} title={tradeState === "settled" ? `Sold ${position.symbol}` : tradeState === "expired" ? "Nothing moved" : tradeState === "failed" ? "Mainnet rejected this sale" : signature ? "Confirmation unavailable" : "Nothing was sent"}>
                <p>{tradeState === "settled" ? "Mainnet confirmed this sale." : tradeState === "failed" ? (tradeProblem ?? "Mainnet rejected this sale. Read the transaction before another attempt.") : tradeState === "expired" ? `The network never included this sale and it can no longer land. Your ${position.symbol} is still in the wallet.` : tradeProblem ?? "Mainnet status could not be read. Check the transaction before another sale."}</p>
                {signature ? <a href={`https://explorer.solana.com/tx/${signature}`} target="_blank" rel="noreferrer">Open transaction</a> : null}
              </ProcessOutcome>
            </ProcessDialog>
          ) : null}

          <section className={styles.activity} aria-labelledby="activity-title">
            <div className={styles.sectionHead}><div><h2 id="activity-title">Recent activity</h2><p>Seametry trades on this device.</p></div></div>
            {activity.length === 0 ? <p className={styles.notice}>No trades recorded here yet.</p> : <ol>{activity.map((entry) => <li key={entry.signature}>
              <div><b>{entry.direction === "buy" ? "Bought" : "Sold"} {entry.symbol}</b><span>{formatAmount(entry.inputAtoms, entry.inputScale)} {entry.direction === "buy" ? "USDC" : entry.symbol}, submitted {new Date(entry.submittedAt).toLocaleString()}</span></div>
              <div><span>{statuses[entry.signature]?.state ?? "Status not read"}</span><a href={`https://explorer.solana.com/tx/${entry.signature}`} target="_blank" rel="noreferrer">Open transaction</a><QuietAction type="button" onClick={() => void check(entry)}>Check status</QuietAction></div>
            </li>)}</ol>}
          </section>
          <Link className={styles.backLink} href="/app/baskets/build">Build another basket</Link>
        </>
      )}
    </div>
  );
}
