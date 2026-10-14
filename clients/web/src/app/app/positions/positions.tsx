"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, Field, Key, LotMark, QuietAction, QuoteBlock, StepTrack } from "@seametry/ui";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import { formatAmount, formatBalance, parseAmount } from "@/lib/amount";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { ListedPosition } from "@/lib/allocation/positions";
import { allocationHoldings, endedAt, type AllocationHolding } from "@/lib/execution/record";
import { approveAndSend, NotSent, type Signer } from "@/lib/execution/run";
import { useExecutions } from "@/lib/execution/store";
import { logoFor } from "@/lib/instrument-logos";
import { ActivityList } from "../_activity/activity";
import styles from "./positions.module.css";

type Reading = { wallet: string; network: "mainnet"; source: string; observedAt: string; positions: ListedPosition[]; outsideRegister: number };
/** amount and review are the sheet's two steps; quoting and signing are the waits between them. */
type Stage = "amount" | "quoting" | "review" | "signing";
type SaleLeg = { mint: string; symbol: string; atoms: string; scale: number };
type AllocationSale = { allocation: AllocationHolding; legs: SaleLeg[]; prepared?: PreparedLeg[]; stage: "idle" | "quoting" | "review" | "signing"; problem?: string };

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `The request returned ${response.status}.`);
  return body as T;
}

async function quoteSale(wallet: string, mint: string, atoms: string): Promise<PreparedLeg> {
  const response = await fetch("/api/allocation/sell/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, mint, atoms }) });
  return responseJson<PreparedLeg>(response);
}

export function Positions() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const wallet = publicKey?.toBase58();
  const signer: Signer = { signTransaction, signAllTransactions, connectedWallet: () => publicKey?.toBase58() };
  const canSign = Boolean(signTransaction || signAllTransactions);

  const [reading, setReading] = useState<Reading>();
  const [readingProblem, setReadingProblem] = useState<string>();
  const [readingBusy, setReadingBusy] = useState(false);
  const records = useExecutions(wallet);
  const allocations = wallet ? allocationHoldings(records, wallet) : [];

  const [selectedMint, setSelectedMint] = useState<string>();
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("sell");
  const [stage, setStage] = useState<Stage>("amount");
  const [amount, setAmount] = useState("");
  const [prepared, setPrepared] = useState<PreparedLeg>();
  const [tradeProblem, setTradeProblem] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [sale, setSale] = useState<AllocationSale>();

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

  // Balances are read again whenever one of this wallet's requests ends.
  const ended = records.filter((execution) => endedAt(execution) !== undefined).length;
  useEffect(() => {
    if (wallet) void refresh(wallet);
  }, [wallet, refresh, ended]);

  useEffect(() => {
    if (!prepared) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [prepared]);

  const position = reading && reading.wallet === wallet ? reading.positions.find((item) => item.mint === selectedMint) : undefined;
  const parsed = position && amount ? parseAmount(amount, position.scale) : undefined;
  const amountProblem = parsed && "refused" in parsed ? parsed.refused : parsed && "atoms" in parsed && parsed.atoms > BigInt(position!.sellableAtoms) ? `The associated token account holds ${formatAmount(position!.sellableAtoms, position!.scale)} ${position!.symbol} available to this route.` : undefined;
  const validAtoms = parsed && "atoms" in parsed && parsed.atoms > 0n && !amountProblem ? parsed.atoms : undefined;
  const remaining = prepared ? Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - now) / 1000)) : 0;

  function openTrade(mint: string) {
    setSelectedMint(mint);
    setTradeTab("sell");
    setAmount("");
    toAmount();
  }

  function toAmount() {
    setPrepared(undefined);
    setTradeProblem(undefined);
    setStage("amount");
  }

  function fillAvailable(percent: bigint) {
    if (!position) return;
    setAmount(formatBalance(BigInt(position.sellableAtoms) * percent / 100n, position.scale));
    toAmount();
  }

  async function reviewSale() {
    if (!wallet || !position || !validAtoms) return;
    setStage("quoting");
    setTradeProblem(undefined);
    try {
      setPrepared(await quoteSale(wallet, position.mint, validAtoms.toString()));
      setNow(Date.now());
      setStage("review");
    } catch (error) {
      setTradeProblem(error instanceof Error ? error.message : String(error));
      setStage("amount");
    }
  }

  async function signSale() {
    if (!wallet || !position || !prepared) return;
    setStage("signing");
    setTradeProblem(undefined);
    try {
      await approveAndSend({ wallet, kind: "sell", subject: position.symbol, prepared: [{ ...prepared, mint: position.mint, symbol: position.symbol }], signer });
      setSelectedMint(undefined);
      setPrepared(undefined);
      setStage("amount");
    } catch (error) {
      setTradeProblem(error instanceof NotSent ? error.message : `${error instanceof Error ? error.message : String(error)} Nothing was sent.`);
      setStage("review");
    }
  }

  /** What Sell All may sell: this Allocation's quantities, capped by what the wallet holds now. */
  const saleLegs = (allocation: AllocationHolding): SaleLeg[] => {
    if (!reading || reading.wallet !== wallet) return [];
    return allocation.legs.map((leg) => {
      const available = BigInt(reading.positions.find((held) => held.mint === leg.mint)?.sellableAtoms ?? "0");
      const tracked = BigInt(leg.atoms);
      return { mint: leg.mint, symbol: leg.symbol, atoms: (tracked < available ? tracked : available).toString(), scale: leg.scale };
    }).filter((leg) => BigInt(leg.atoms) > 0n);
  };

  async function reviewAllocationSale() {
    if (!wallet || !sale) return;
    if (sale.legs.length === 0) {
      setSale({ ...sale, problem: "This wallet no longer holds any of this Allocation's quantities." });
      return;
    }
    setSale({ ...sale, stage: "quoting", problem: undefined, prepared: undefined });
    try {
      const quoted = await Promise.all(sale.legs.map((leg) => quoteSale(wallet, leg.mint, leg.atoms)));
      setSale((current) => current && { ...current, stage: "review", prepared: quoted });
    } catch (error) {
      setSale((current) => current && { ...current, stage: "idle", problem: error instanceof Error ? error.message : String(error) });
    }
  }

  async function approveAllocationSale() {
    if (!wallet || !sale?.prepared) return;
    setSale({ ...sale, stage: "signing", problem: undefined });
    try {
      const { id, name, templateId } = sale.allocation;
      await approveAndSend({ wallet, kind: "sell", subject: name, allocation: { id, name, ...(templateId ? { templateId } : {}) }, prepared: sale.prepared.map((quote, index) => ({ ...quote, mint: sale.legs[index].mint, symbol: sale.legs[index].symbol })), signer });
      setSale(undefined);
    } catch (error) {
      setSale((current) => current && { ...current, stage: "review", problem: error instanceof Error ? error.message : String(error) });
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
                    <QuietAction type="button" onClick={() => setSale({ allocation, legs: saleLegs(allocation), stage: "idle" })}>Sell allocation</QuietAction>
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
            open={Boolean(sale)}
            onClose={() => setSale(undefined)}
            title={sale ? `Sell ${sale.allocation.name}` : "Sell Allocation"}
            register="Mainnet"
            closeLabel="Hide Allocation sale"
            footer={sale ? (
              sale.stage === "review" || sale.stage === "signing"
                ? <Key type="button" onClick={() => void approveAllocationSale()} busy={sale.stage === "signing"} busyLabel="Waiting for wallet" disabled={!canSign} disabledReason="This wallet cannot sign transactions in this browser. Open Seametry in the wallet's own browser or connect another wallet.">Approve sell all</Key>
                : <Key type="button" onClick={() => void reviewAllocationSale()} busy={sale.stage === "quoting"} busyLabel="Quoting every sale" disabled={sale.legs.length === 0} disabledReason="This wallet no longer holds any of this Allocation's quantities.">Review sell all</Key>
            ) : undefined}
          >
            {sale ? (
              <div className={styles.batchSale}>
                <p className={styles.notice}>Sells only the quantities this Allocation bought, capped by what the wallet holds now. One approval signs every sale; the sheet then closes and Activity follows each one.</p>
                <ol className={styles.batchSaleLegs}>
                  {sale.legs.map((leg, index) => {
                    const quote = sale.prepared?.[index];
                    return (
                      <li key={leg.mint}>
                        <LotMark symbol={leg.symbol} src={logoFor(leg.mint)} size="list" />
                        <div><b>{leg.symbol}</b><span>{formatBalance(leg.atoms, leg.scale)} to sell</span></div>
                        {quote ? <div className={styles.saleQuote}><strong>{formatAmount(quote.outAtoms, 6)} USDC</strong><small>expected, at least {formatAmount(quote.floorAtoms, 6)}</small></div> : null}
                      </li>
                    );
                  })}
                </ol>
                {sale.problem ? <p className={styles.problem} role="alert">{sale.problem}</p> : null}
              </div>
            ) : null}
          </ModalSheet>

          <ModalSheet
            open={Boolean(position)}
            onClose={() => setSelectedMint(undefined)}
            title={`Trade ${position?.symbol ?? "instrument"}`}
            register="Mainnet"
            closeLabel="Hide trade sheet"
            footer={position ? tradeTab === "buy" ? (
              <Link className={styles.sheetLink} href={`/app/baskets/build?add=${encodeURIComponent(position.mint)}`}>Buy {position.symbol}</Link>
            ) : stage === "amount" || stage === "quoting" ? (
              <Key type="button" onClick={() => void reviewSale()} disabled={!validAtoms || !canSign} busy={stage === "quoting"} busyLabel="Checking sale" disabledReason={!canSign ? "This wallet cannot sign transactions in this browser." : "Enter an amount to sell, up to what this route can take."}>Review sale</Key>
            ) : remaining === 0 && stage === "review" ? (
              <ContinueAction type="button" onClick={() => void reviewSale()}>Request current terms</ContinueAction>
            ) : (
              <Key type="button" onClick={() => void signSale()} busy={stage === "signing"} busyLabel="Waiting for wallet">Sign sale</Key>
            ) : undefined}
          >
            {position ? <div className={styles.sale}>
              {stage === "amount" || stage === "quoting" ? <div className={styles.tradeTabs} role="tablist" aria-label="Trade direction">
                <button type="button" role="tab" aria-selected={tradeTab === "buy"} onClick={() => setTradeTab("buy")}>Buy</button>
                <button type="button" role="tab" aria-selected={tradeTab === "sell"} onClick={() => setTradeTab("sell")}>Sell</button>
              </div> : null}
              {tradeTab === "buy" ? <div className={styles.tradePanel} role="tabpanel"><p>Buy {position.symbol} into this wallet through an Allocation. The purchase receives a fresh mainnet quote before signing.</p></div> : <div className={styles.tradePanel} role="tabpanel">
                <StepTrack label="Sale steps" steps={["Amount", "Review"]} current={stage === "review" || stage === "signing" ? 1 : 0} onStep={(index) => { if (index === 0 && stage !== "signing") toAmount(); }} />
                {stage === "amount" || stage === "quoting" ? <>
                  <p>A market swap into USDC. This is not issuer redemption or an Alloy Melt.</p>
                  <Field id="sale-amount" label={`Amount of ${position.symbol} to sell`} inputMode="decimal" value={amount} disabled={stage === "quoting"} onChange={(event) => { setAmount(event.target.value); toAmount(); }} message={amountProblem ?? `Available to this route: ${formatAmount(position.sellableAtoms, position.scale)} ${position.symbol}, observed ${new Date(reading!.observedAt).toLocaleString()}.`} invalid={Boolean(amountProblem)} />
                  <div className={styles.amountShortcuts}>
                    <QuietAction type="button" onClick={() => fillAvailable(25n)} disabled={position.sellableAtoms === "0"}>Use 25%</QuietAction>
                    <QuietAction type="button" onClick={() => fillAvailable(50n)} disabled={position.sellableAtoms === "0"}>Use 50%</QuietAction>
                    <QuietAction type="button" onClick={() => fillAvailable(100n)} disabled={position.sellableAtoms === "0"}>Use available balance</QuietAction>
                  </div>
                </> : prepared ? <div className={styles.quote}>
                  <QuoteBlock floor={formatAmount(prepared.floorAtoms, 6)} expected={formatAmount(prepared.outAtoms, 6)} unit="USDC" fees={[{ label: `Seametry routing fee, ${formatAmount(BigInt(prepared.routingFeeBps), 2)}%`, value: `${formatAmount(prepared.routingFeeAtoms, 6)} USDC` }, { label: "Priority fee set by the route", value: `${formatAmount(prepared.priorityFeeLamports, 9)} SOL` }, { label: "Venue fees", value: "Included in expected output" }]} route={`Jupiter through ${prepared.route.join(", ")}, slot ${prepared.contextSlot}`} received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(prepared.receivedAt)) / 1000))}s`, absolute: prepared.receivedAt }} secondsLeft={remaining} />
                  <p>Simulated on mainnet for this wallet: {prepared.simulated.map((change) => `${change.atoms.startsWith("-") ? "" : "+"}${formatAmount(change.atoms, change.scale)} ${change.unit}`).join("; ")}.</p>
                </div> : null}
                {tradeProblem ? <p className={styles.problem} role="alert">{tradeProblem}</p> : null}
              </div>}
            </div> : null}
          </ModalSheet>

          <section className={styles.activity} aria-labelledby="activity-title">
            <div className={styles.sectionHead}><div><h2 id="activity-title">Activity</h2><p>What this browser bought and sold for this wallet.</p></div></div>
            <ActivityList records={records} />
          </section>
          <Link className={styles.backLink} href="/app/baskets/build">Build another basket</Link>
        </>
      )}
    </div>
  );
}
