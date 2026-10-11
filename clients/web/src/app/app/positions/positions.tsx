"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Field, Key, LotMark, QuietAction, QuoteBlock } from "@seametry/ui";
import { formatAmount, formatBalance, parseAmount } from "@/lib/amount";
import { forgetLocalTrade, readLocalTrades, recordLocalTrade, signedSignature, type LocalTrade } from "@/lib/allocation/activity";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { ListedPosition } from "@/lib/allocation/positions";
import { logoFor } from "@/lib/instrument-logos";
import styles from "./positions.module.css";

type Reading = { wallet: string; network: "mainnet"; source: string; observedAt: string; positions: ListedPosition[]; outsideRegister: number };
type TradeState = "idle" | "preparing" | "review" | "signing" | "checking" | "settled" | "failed" | "unavailable";
type ActivityStatus = { signature: string; state: string; detail?: string };

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
  const { publicKey, signTransaction } = useWallet();
  const wallet = publicKey?.toBase58();
  const [reading, setReading] = useState<Reading>();
  const [readingProblem, setReadingProblem] = useState<string>();
  const [readingBusy, setReadingBusy] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string>();
  const [amount, setAmount] = useState("");
  const [prepared, setPrepared] = useState<PreparedLeg>();
  const [tradeState, setTradeState] = useState<TradeState>("idle");
  const [tradeProblem, setTradeProblem] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [activity, setActivity] = useState<LocalTrade[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ActivityStatus>>({});
  const [now, setNow] = useState(() => Date.now());

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
      const response = await fetch(`/api/allocation/status?signature=${encodeURIComponent(entry.signature)}`, { cache: "no-store" });
      const status = await responseJson<{ state: string; detail?: string }>(response);
      setStatuses((current) => ({ ...current, [entry.signature]: { signature: entry.signature, ...status } }));
      if (entry.signature === signature && (status.state === "confirmed" || status.state === "finalized")) {
        setTradeState("settled");
        if (wallet) void refresh(wallet);
      }
      if (entry.signature === signature && status.state === "failed") {
        setTradeState("failed");
        setTradeProblem(status.detail ?? "Mainnet rejected this sale. Read the transaction before another attempt.");
      }
    } catch (error) {
      setStatuses((current) => ({ ...current, [entry.signature]: { signature: entry.signature, state: "unavailable", detail: error instanceof Error ? error.message : String(error) } }));
    }
  }, [refresh, signature, wallet]);

  useEffect(() => {
    if (!wallet) return;
    void refresh(wallet);
    const stored = readLocalTrades(wallet);
    setActivity(stored);
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

  const position = reading && reading.wallet === wallet ? reading.positions.find((item) => item.mint === selectedMint) : undefined;
  const parsed = position && amount ? parseAmount(amount, position.scale) : undefined;
  const amountProblem = parsed && "refused" in parsed ? parsed.refused : parsed && "atoms" in parsed && parsed.atoms > BigInt(position!.sellableAtoms) ? `The associated token account holds ${formatAmount(position!.sellableAtoms, position!.scale)} ${position!.symbol} available to this route.` : undefined;
  const validAtoms = parsed && "atoms" in parsed && parsed.atoms > 0n && !amountProblem ? parsed.atoms : undefined;
  const remaining = prepared ? Math.max(0, Math.ceil((Date.parse(prepared.expiresAt) - now) / 1000)) : 0;

  async function prepare() {
    if (!wallet || !position || !validAtoms) return;
    setTradeState("preparing");
    setTradeProblem(undefined);
    setPrepared(undefined);
    try {
      const response = await fetch("/api/allocation/sell/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, mint: position.mint, atoms: validAtoms.toString() }) });
      setPrepared(await responseJson<PreparedLeg>(response));
      setTradeState("review");
    } catch (error) {
      setTradeState("unavailable");
      setTradeProblem(error instanceof Error ? error.message : String(error));
    }
  }

  async function signSale() {
    if (!wallet || !position || !prepared || !signTransaction || remaining === 0) return;
    setTradeState("signing");
    setTradeProblem(undefined);
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
          <section className={styles.ledger} aria-labelledby="holdings-title">
            <header className={styles.sectionHead}>
              <div><h2 id="holdings-title">In this wallet</h2><p>Solana mainnet RPC. {reading?.wallet === wallet ? `Observed ${new Date(reading.observedAt).toLocaleString()}.` : "No observation yet."}</p></div>
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
                  <QuietAction type="button" onClick={() => { setSelectedMint(item.mint); setAmount(""); setPrepared(undefined); setTradeState("idle"); setTradeProblem(undefined); }}>Sell {item.symbol}</QuietAction>
                </li>)}
              </ul>
            ) : null}
            {reading?.wallet === wallet && reading.outsideRegister > 0 ? <p className={styles.notice}>This wallet also holds tokens outside this register. They are not included in these rows.</p> : null}
          </section>

          {position ? <section className={styles.sale} aria-labelledby="sale-title">
            <div className={styles.sectionHead}><div><h2 id="sale-title">Sell {position.symbol}</h2><p>A market swap into USDC. This is not issuer redemption or an Alloy Melt.</p></div></div>
            <Field id="sale-amount" label={`Amount of ${position.symbol} to sell`} inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); setPrepared(undefined); setTradeState("idle"); }} message={amountProblem ?? `Available to this route: ${formatAmount(position.sellableAtoms, position.scale)} ${position.symbol}, observed ${new Date(reading!.observedAt).toLocaleString()}.`} invalid={Boolean(amountProblem)} />
            <div className={styles.actions}><QuietAction type="button" onClick={() => { setAmount(formatBalance(position.sellableAtoms, position.scale)); setPrepared(undefined); setTradeState("idle"); }} disabled={position.sellableAtoms === "0"}>Use available balance</QuietAction>
              {!prepared ? <Key type="button" onClick={() => void prepare()} disabled={!validAtoms || tradeState === "preparing" || tradeState === "checking" || tradeState === "signing" || !signTransaction} busy={tradeState === "preparing"} busyLabel="Checking sale" disabledReason={!signTransaction ? "This wallet cannot sign transactions in this browser." : undefined}>Review sale</Key> : null}
            </div>
            {prepared ? <div className={styles.quote}>
              <QuoteBlock floor={formatAmount(prepared.floorAtoms, 6)} expected={formatAmount(prepared.outAtoms, 6)} unit="USDC" fees={[{ label: `Seametry routing fee, ${formatAmount(BigInt(prepared.routingFeeBps), 2)}%`, value: `${formatAmount(prepared.routingFeeAtoms, 6)} USDC` }, { label: "Priority fee set by the route", value: `${formatAmount(prepared.priorityFeeLamports, 9)} SOL` }, { label: "Venue fees", value: "Included in expected output" }]} route={`Jupiter through ${prepared.route.join(", ")}, slot ${prepared.contextSlot}`} received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(prepared.receivedAt)) / 1000))}s`, absolute: prepared.receivedAt }} secondsLeft={remaining} />
              <p>Simulated on mainnet for this wallet: {prepared.simulated.map((change) => `${change.atoms.startsWith("-") ? "" : "+"}${formatAmount(change.atoms, change.scale)} ${change.unit}`).join("; ")}.</p>
              <Key type="button" onClick={() => void signSale()} disabled={remaining === 0 || tradeState === "signing" || tradeState === "checking"} busy={tradeState === "signing"} busyLabel="Signing sale" disabledReason={remaining === 0 ? "This quote expired. Request current terms before signing." : undefined}>Sign sale</Key>
              {remaining === 0 ? <QuietAction type="button" onClick={() => void prepare()}>Request current terms</QuietAction> : null}
            </div> : null}
            {tradeProblem ? <p className={styles.problem} role="alert">{tradeProblem}</p> : null}
            {signature ? <p className={styles.notice} role="status">{tradeState === "settled" ? "Sale confirmed on mainnet." : tradeState === "failed" ? "Sale failed on mainnet." : "Checking the sale on mainnet."} <a href={`https://explorer.solana.com/tx/${signature}`} target="_blank" rel="noreferrer">Open transaction</a></p> : null}
          </section> : null}

          <section className={styles.activity} aria-labelledby="activity-title">
            <div className={styles.sectionHead}><div><h2 id="activity-title">Recent activity</h2><p>Signatures saved in this browser. Each status is read from mainnet; this is not a sealed hallmark.</p></div></div>
            {activity.length === 0 ? <p className={styles.notice}>No Seametry signatures saved on this device. Your holdings above still come from the wallet.</p> : <ol>{activity.map((entry) => <li key={entry.signature}>
              <div><b>{entry.direction === "buy" ? "Bought" : "Sold"} {entry.symbol}</b><span>{formatAmount(entry.inputAtoms, entry.inputScale)} {entry.direction === "buy" ? "USDC" : entry.symbol}, submitted {new Date(entry.submittedAt).toLocaleString()}</span></div>
              <div><span>{statuses[entry.signature]?.state ?? "Status not read"}</span><a href={`https://explorer.solana.com/tx/${entry.signature}`} target="_blank" rel="noreferrer">Open transaction</a><QuietAction type="button" onClick={() => void check(entry)}>Check status</QuietAction></div>
            </li>)}</ol>}
            <p className={styles.notice}>Trades made outside Seametry or on another device are not listed here. They remain visible in your wallet and on mainnet.</p>
          </section>
          <Link className={styles.backLink} href="/app/allocation">Buy another constituent</Link>
        </>
      )}
    </div>
  );
}
