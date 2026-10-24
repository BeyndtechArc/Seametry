"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, Field, IconButton, Key, LotMark, QuietAction, QuoteBlock, StepTrack } from "@seametry/ui";
import { Identity, List, ListCell, ListRow } from "@seametry/ui/list";
import { Tabs } from "@seametry/ui/tabs";
import { Banner } from "@seametry/ui/banner";
import { Callout } from "@seametry/ui/callout";
import { PageHeader } from "../_shell/page-header";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import { formatAmount, formatBalance, parseAmount } from "@/lib/amount";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { HeldPosition } from "@/lib/allocation/positions";
import { MIN_LEG_USDC_ATOMS, USDC_SCALE } from "@/lib/allocation/rules";
import { allocationHoldings, endedAt, type AllocationHolding } from "@/lib/execution/record";
import { approveAndSend, NotSent, type Signer } from "@/lib/execution/run";
import { useExecutions } from "@/lib/execution/store";
import { logoSrc } from "@/lib/logo-src";
import { firstTouchFor, firstTouchSent } from "@/lib/first-touch";
import { funnel } from "@/lib/funnel";
import { ActivityList } from "../_activity/activity";
import styles from "./positions.module.css";

type Reading = { wallet: string; network: "mainnet"; source: string; observedAt: string; positions: HeldPosition[]; outsideRegister: number };
type View = "positions" | "allocations" | "activity";
const VIEW_NAMES: Record<View, string> = { positions: "Positions", allocations: "Allocations", activity: "Activity" };
/** amount and review are the sheet's two steps; quoting and signing are the waits between them. */
type Stage = "amount" | "quoting" | "review" | "signing";
type SaleLeg = { mint: string; symbol: string; atoms: string; scale: number };
type AllocationSale = { allocation: AllocationHolding; legs: SaleLeg[]; prepared?: PreparedLeg[]; stage: "idle" | "quoting" | "review" | "signing"; problem?: string };

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `The request returned ${response.status}.`);
  return body as T;
}

/**
 * One purchase of one holding, quoted as an Allocation of that stock alone,
 * so it is checked, approved and recorded as every purchase is. A 402 is a
 * shortfall: nothing was prepared, and the holder is told what to fund.
 */
async function quotePurchase(wallet: string, mint: string, symbol: string, usdcAtoms: bigint): Promise<PreparedLeg> {
  const response = await fetch("/api/allocation/prepare-batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, legs: [{ mint, usdcAtoms: usdcAtoms.toString() }], planMints: [mint], subject: symbol, firstTouch: firstTouchFor(wallet) }) });
  const [quoted] = await responseJson<PreparedLeg[]>(response);
  firstTouchSent(wallet);
  funnel("review_opened", { wallet, quoteId: quoted?.quoteId });
  return quoted;
}

/** Every leg in one request, so one server paces their Jupiter calls together. */
async function quoteSales(wallet: string, subject: string, legs: { mint: string; atoms: string }[]): Promise<PreparedLeg[]> {
  const response = await fetch("/api/allocation/sell/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, subject, legs, firstTouch: firstTouchFor(wallet) }) });
  const quoted = await responseJson<PreparedLeg[]>(response);
  firstTouchSent(wallet);
  funnel("review_opened", { wallet, quoteId: quoted[0]?.quoteId });
  return quoted;
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
  // The Buy tab's amount is USDC, so it is kept apart from the sale's.
  const [spend, setSpend] = useState("");
  const [prepared, setPrepared] = useState<PreparedLeg>();
  const [tradeProblem, setTradeProblem] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [sale, setSale] = useState<AllocationSale>();
  const [view, setView] = useState<View>("positions");

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
  const spendParsed = spend ? parseAmount(spend, USDC_SCALE) : undefined;
  const spendProblem = spendParsed && "refused" in spendParsed ? spendParsed.refused : spendParsed && "atoms" in spendParsed && spendParsed.atoms < MIN_LEG_USDC_ATOMS ? `Spend at least ${formatBalance(MIN_LEG_USDC_ATOMS, USDC_SCALE)} USDC.` : undefined;
  const validSpend = spendParsed && "atoms" in spendParsed && !spendProblem ? spendParsed.atoms : undefined;
  const remaining = prepared ? Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - now) / 1000)) : 0;

  function openTrade(mint: string) {
    setSelectedMint(mint);
    setTradeTab("sell");
    setAmount("");
    setSpend("");
    toAmount();
  }

  function chooseTab(tab: "buy" | "sell") {
    setTradeTab(tab);
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
      setPrepared((await quoteSales(wallet, position.symbol, [{ mint: position.mint, atoms: validAtoms.toString() }]))[0]);
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

  async function reviewPurchase() {
    if (!wallet || !position || !validSpend) return;
    setStage("quoting");
    setTradeProblem(undefined);
    try {
      setPrepared(await quotePurchase(wallet, position.mint, position.symbol, validSpend));
      setNow(Date.now());
      setStage("review");
    } catch (error) {
      setTradeProblem(error instanceof Error ? error.message : String(error));
      setStage("amount");
    }
  }

  async function signPurchase() {
    if (!wallet || !position || !prepared) return;
    setStage("signing");
    setTradeProblem(undefined);
    try {
      await approveAndSend({ wallet, kind: "buy", subject: position.symbol, prepared: [{ ...prepared, mint: position.mint, symbol: position.symbol }], signer });
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
      const quoted = await quoteSales(wallet, sale.allocation.name, sale.legs.map(({ mint, atoms }) => ({ mint, atoms })));
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

  /** A purchase or a sale's terms, in the unit it delivers; the routing fee is USDC either way. */
  const quoteView = (quote: PreparedLeg, unit: string) => (
    <div className={styles.quote}>
      <QuoteBlock floor={formatAmount(quote.floorAtoms, quote.outScale)} expected={formatAmount(quote.outAtoms, quote.outScale)} unit={unit} fees={[{ label: `Seametry routing fee, ${formatAmount(BigInt(quote.routingFeeBps), 2)}%${quote.tipOffsetBps > 0 ? `, ${formatAmount(BigInt(quote.tipOffsetBps), 2)}% lower to cover the landing tip` : ""}`, value: `${formatAmount(quote.routingFeeAtoms, USDC_SCALE)} USDC` }, { label: "Priority fee set by the route", value: `${formatAmount(quote.priorityFeeLamports, 9)} SOL` }, ...(quote.landing === "sender" ? [{ label: "Landing tip to Helius Sender", value: `${formatAmount(quote.tipLamports, 9)} SOL` }] : []), { label: "Venue fees", value: "Included in expected output" }]} route={`Jupiter through ${quote.route.join(", ")}, slot ${quote.contextSlot}`} received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(quote.receivedAt)) / 1000))}s`, absolute: quote.receivedAt }} secondsLeft={remaining} />
      <p>Simulated on mainnet for this wallet: {quote.simulated.map((change) => `${change.atoms.startsWith("-") ? "" : "+"}${formatAmount(change.atoms, change.scale)} ${change.unit}`).join("; ")}.</p>
    </div>
  );

  const held = reading?.wallet === wallet ? reading : undefined;
  return (
    <div className={styles.workspace}>
      <PageHeader
        title="Holdings"
        network="Mainnet"
        info={<p>These quantities are read from your connected wallet on mainnet. A sale is a separate swap into USDC, not an Alloy Melt or an issuer redemption.</p>}
        tabs={wallet ? (
          <Tabs
            label="Holdings"
            controls="holdings-view"
            value={view}
            onChange={setView}
            items={[
              { value: "positions", label: "Positions", count: held?.positions.length },
              { value: "allocations", label: "Allocations", count: allocations.length },
              { value: "activity", label: "Activity", count: records.length },
            ]}
          />
        ) : undefined}
      />
      {!wallet ? <Banner action={<QuietAction type="button" icon="wallet" onClick={() => document.getElementById("app-wallet")?.click()}>Connect wallet</QuietAction>}>Connect the wallet that holds your instruments to see them here. Connecting buys or sells nothing.</Banner> : (
        <>
          <div id="holdings-view" role="tabpanel" aria-label={VIEW_NAMES[view]} className={styles.view}>
            {view === "positions" ? <>
              <div className={styles.viewMeta}>
                <p>Exact token quantities from Solana mainnet RPC{held ? `, observed ${new Date(held.observedAt).toLocaleTimeString()}` : ""}. No price is observed, so no total is shown.</p>
                <IconButton icon="refresh" label="Read holdings again" onClick={() => void refresh(wallet)} disabled={readingBusy} />
              </div>
              {readingBusy && !held ? <p className={styles.notice} role="status">Reading mainnet token accounts for this wallet.</p> : null}
              {readingProblem ? <Callout tone="blocked" title="Holdings could not be read" announce action={<QuietAction type="button" icon="refresh" onClick={() => void refresh(wallet)}>Read again</QuietAction>}>{readingProblem}</Callout> : null}
              {held && held.positions.length === 0 ? <Callout title="Nothing from the register in this wallet">Other tokens the wallet holds are not shown here. Buy a basket or an Allocation to hold instruments Seametry has assayed.</Callout> : null}
              {held && held.positions.length > 0 ? (
                <List label="Instruments in this wallet" head={["Instrument", "Held", "Sellable here"]} className={styles.positionColumns}>
                  {held.positions.map((item) => (
                    <ListRow key={item.mint} onSelect={() => openTrade(item.mint)} label={`Trade ${item.symbol}`}>
                      <Identity symbol={item.symbol} name={item.name} logo={item.logo} />
                      <ListCell>{formatBalance(item.atoms, item.scale)}</ListCell>
                      <ListCell wide>{formatBalance(item.sellableAtoms, item.scale)}</ListCell>
                    </ListRow>
                  ))}
                </List>
              ) : null}
              {held && held.outsideRegister > 0 ? <p className={styles.footnote}>This wallet also holds {held.outsideRegister} {held.outsideRegister === 1 ? "token" : "tokens"} outside this register, not shown here.</p> : null}
            </> : view === "allocations" ? <>
              <p className={styles.viewMeta}>Grouped on this device from purchases made here, capped by what the wallet holds when you sell.</p>
              {allocations.length === 0 ? <Callout title="No Allocation bought from this browser">Allocations are grouped from purchases made on this device. A basket bought here appears with a way to sell it whole.</Callout> : (
                <List label="Allocations" head={["Allocation", "Holds", "Bought"]} className={styles.allocationColumns}>
                  {allocations.map((allocation) => (
                    <ListRow key={allocation.id} onSelect={() => setSale({ allocation, legs: saleLegs(allocation), stage: "idle" })} label={`Sell ${allocation.name}`}>
                      <span className={styles.allocationName}><b>{allocation.name}</b><small>{allocation.templateId ? "Published basket" : "Custom"}</small></span>
                      <ListCell>{allocation.legs.map((leg) => leg.symbol).join(", ")}</ListCell>
                      <ListCell wide>{new Date(allocation.createdAt).toLocaleDateString()}</ListCell>
                    </ListRow>
                  ))}
                </List>
              )}
            </> : <ActivityList records={records} />}
          </div>

          <ModalSheet
            open={Boolean(sale)}
            onClose={() => {
              if (sale?.stage === "review" && sale.prepared) funnel("sheet_abandoned", { wallet, quoteId: sale.prepared[0]?.quoteId });
              setSale(undefined);
            }}
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
                        <LotMark symbol={leg.symbol} src={logoSrc(leg.mint)} size="list" />
                        <div><b>{leg.symbol}</b><span>{formatBalance(leg.atoms, leg.scale)} to sell</span></div>
                        {quote ? <div className={styles.saleQuote}><strong>{formatAmount(quote.outAtoms, 6)} USDC</strong><small>expected, at least {formatAmount(quote.floorAtoms, 6)}</small></div> : null}
                      </li>
                    );
                  })}
                </ol>
                {sale.problem ? <Callout tone="blocked" announce>{sale.problem}</Callout> : null}
              </div>
            ) : null}
          </ModalSheet>

          <ModalSheet
            open={Boolean(position)}
            onClose={() => {
              if (stage === "review" && prepared) funnel("sheet_abandoned", { wallet, quoteId: prepared.quoteId });
              setSelectedMint(undefined);
            }}
            title={`Trade ${position?.symbol ?? "instrument"}`}
            register="Mainnet"
            closeLabel="Hide trade sheet"
            footer={position ? stage === "amount" || stage === "quoting" ? tradeTab === "buy" ? (
              <Key type="button" onClick={() => void reviewPurchase()} disabled={!validSpend || !canSign} busy={stage === "quoting"} busyLabel="Checking purchase" disabledReason={!canSign ? "This wallet cannot sign transactions in this browser." : `Enter at least ${formatBalance(MIN_LEG_USDC_ATOMS, USDC_SCALE)} USDC to spend.`}>Review purchase</Key>
            ) : (
              <Key type="button" onClick={() => void reviewSale()} disabled={!validAtoms || !canSign} busy={stage === "quoting"} busyLabel="Checking sale" disabledReason={!canSign ? "This wallet cannot sign transactions in this browser." : "Enter an amount to sell, up to what this route can take."}>Review sale</Key>
            ) : remaining === 0 && stage === "review" ? (
              <ContinueAction type="button" onClick={() => void (tradeTab === "buy" ? reviewPurchase() : reviewSale())}>Request current terms</ContinueAction>
            ) : (
              <Key type="button" onClick={() => void (tradeTab === "buy" ? signPurchase() : signSale())} busy={stage === "signing"} busyLabel="Waiting for wallet">{tradeTab === "buy" ? "Sign purchase" : "Sign sale"}</Key>
            ) : undefined}
          >
            {position ? <div className={styles.sale}>
              {stage === "amount" || stage === "quoting" ? <div className={styles.tradeTabs} role="tablist" aria-label="Trade direction">
                <button type="button" role="tab" aria-selected={tradeTab === "buy"} onClick={() => chooseTab("buy")}>Buy</button>
                <button type="button" role="tab" aria-selected={tradeTab === "sell"} onClick={() => chooseTab("sell")}>Sell</button>
              </div> : null}
              {tradeTab === "buy" ? <div className={styles.tradePanel} role="tabpanel">
                <StepTrack label="Purchase steps" steps={["Amount", "Review"]} current={stage === "review" || stage === "signing" ? 1 : 0} onStep={(index) => { if (index === 0 && stage !== "signing") toAmount(); }} />
                {stage === "amount" || stage === "quoting" ? <>
                  <p>A market swap from USDC into {position.symbol}, settled straight to this wallet.</p>
                  <Field id="purchase-amount" label="USDC to spend" inputMode="decimal" value={spend} disabled={stage === "quoting"} onChange={(event) => { setSpend(event.target.value); toAmount(); }} message={spendProblem ?? `At least ${formatBalance(MIN_LEG_USDC_ATOMS, USDC_SCALE)} USDC. The quote is fetched fresh from mainnet before you sign.`} invalid={Boolean(spendProblem)} />
                </> : prepared ? quoteView(prepared, position.symbol) : null}
                {tradeProblem ? <Callout tone="blocked" announce>{tradeProblem}</Callout> : null}
              </div> : <div className={styles.tradePanel} role="tabpanel">
                <StepTrack label="Sale steps" steps={["Amount", "Review"]} current={stage === "review" || stage === "signing" ? 1 : 0} onStep={(index) => { if (index === 0 && stage !== "signing") toAmount(); }} />
                {stage === "amount" || stage === "quoting" ? <>
                  <p>A market swap into USDC. This is not issuer redemption or an Alloy Melt.</p>
                  <Field id="sale-amount" label={`Amount of ${position.symbol} to sell`} inputMode="decimal" value={amount} disabled={stage === "quoting"} onChange={(event) => { setAmount(event.target.value); toAmount(); }} message={amountProblem ?? `Available to this route: ${formatAmount(position.sellableAtoms, position.scale)} ${position.symbol}, observed ${new Date(reading!.observedAt).toLocaleString()}.`} invalid={Boolean(amountProblem)} />
                  <div className={styles.amountShortcuts}>
                    <QuietAction type="button" onClick={() => fillAvailable(25n)} disabled={position.sellableAtoms === "0"}>Use 25%</QuietAction>
                    <QuietAction type="button" onClick={() => fillAvailable(50n)} disabled={position.sellableAtoms === "0"}>Use 50%</QuietAction>
                    <QuietAction type="button" onClick={() => fillAvailable(100n)} disabled={position.sellableAtoms === "0"}>Use available balance</QuietAction>
                  </div>
                </> : prepared ? quoteView(prepared, "USDC") : null}
                {tradeProblem ? <Callout tone="blocked" announce>{tradeProblem}</Callout> : null}
              </div>}
            </div> : null}
          </ModalSheet>

        </>
      )}
    </div>
  );
}
