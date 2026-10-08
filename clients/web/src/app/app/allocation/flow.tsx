"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ConditionReport, ContinueAction, Field, FilterBar, Key, LotMark, MarkLine, QuietAction, QuoteBlock, StepBar, StepTrack, Stamp } from "@seametry/ui";
import { describeSplit, formatAmount, parseAmount, splitEvenly } from "@/lib/amount";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { OfferedLot, RefusedLot } from "@/lib/allocation/offer";
import { logoFor } from "@/lib/instrument-logos";
import { shortIssuer } from "@/lib/issuers";
import { SLIPPAGE_BPS, USDC_SCALE, lotCapAtoms, routingFeeAtoms, routingFeeBps } from "@/lib/allocation/rules";
import styles from "./allocation.module.css";

type Phase = "idle" | "preparing" | "prepared" | "signing" | "sending" | "settled" | "failed";

type Leg = {
  mint: string;
  symbol: string;
  atoms: bigint;
  phase: Phase;
  prepared?: PreparedLeg;
  signature?: string;
  note?: string;
};

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
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
  if (!response.ok) throw new Error(payload.error ?? `${path} answered ${response.status}`);
  return payload as T;
}

const phaseLabel: Record<Phase, string> = {
  idle: "Not previewed",
  preparing: "Preparing",
  prepared: "Ready to sign",
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
      <section className={styles.orderHandoff} aria-label="Alloy handoff">
        <h3>Alloy handoff</h3>
        <p>When this wallet holds a Formula&apos;s exact quantities, Strike can deposit them for Alloy shares. Mainnet Hall is not active in this build.</p>
      </section>
    </div>
  );
}

export function AllocationFlow({
  offered,
  refused,
  unavailable,
}: {
  offered: OfferedLot[];
  refused: RefusedLot[];
  unavailable?: string;
}) {
  const { publicKey, connected, signTransaction } = useWallet();
  // Nothing starts chosen: choosing is the first step's whole question.
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState<{ plan: string; changes: Record<string, Partial<Leg>> }>({ plan: "", changes: {} });
  const [now, setNow] = useState(() => Date.now());

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
  const hiddenChosen = offered.filter((lot) => selected.includes(lot.mint)).length - chosen.length;
  const split = parsed && "atoms" in parsed ? splitEvenly(parsed.atoms, chosen.length) : [];
  const overCapacity = split.findIndex((atoms, index) => atoms > lotCapAtoms(chosen[index]?.capacityUsdc ?? 0));
  const amountProblem =
    parsed && "refused" in parsed
      ? parsed.refused
      : overCapacity >= 0
        ? `${chosen[overCapacity].symbol} may take at most ${formatAmount(BigInt(chosen[overCapacity].capacityUsdc), 0)} USDC under this captured capacity decision.`
        : split.some((atoms) => atoms === 0n) && split.length > 0
          ? "The amount is too small to fund every selected constituent."
          : undefined;

  // The plan is derived from the inputs on every render. Progress is kept as
  // each leg's changes, and only while it belongs to the same plan; the
  // inputs lock once a leg has started, so progress never lands on another.
  const plan = `${typed}|${chosen.map((lot) => lot.mint).join(",")}`;
  const changes = progress.plan === plan ? progress.changes : {};
  const legs: Leg[] =
    amountProblem || split.length === 0
      ? []
      : chosen.map((lot, i) => ({ mint: lot.mint, symbol: lot.symbol, atoms: split[i], phase: "idle", ...changes[lot.mint] }));
  const started = legs.some((leg) => leg.phase !== "idle" || leg.note);

  const anyPrepared = legs.some((leg) => leg.phase === "prepared");
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
    setProgress({ plan: "", changes: {} });
    setTyped("");
    setStep(0);
  };

  const prepare = useCallback(
    // planMints travels with each leg because the plan's size sets the fee
    // tier, and the server charges it, not this page.
    async (leg: Leg, planMints: string[]) => {
      if (!publicKey) return;
      update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined });
      try {
        const prepared = await postJson<PreparedLeg>("/api/allocation/prepare", {
          wallet: publicKey.toBase58(),
          mint: leg.mint,
          usdcAtoms: leg.atoms.toString(),
          planMints,
        });
        setNow(Date.now());
        update(leg.mint, { phase: "prepared", prepared });
      } catch (error) {
        update(leg.mint, { phase: "idle", note: reasonFrom(error) });
      }
    },
    [publicKey, update],
  );

  const watch = useCallback(
    async (mint: string, signature: string) => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const response = await fetch(`/api/allocation/status?signature=${signature}`);
          const status = (await response.json()) as { state?: string; detail?: string; error?: string };
          if (status.state === "confirmed" || status.state === "finalized") {
            update(mint, { phase: "settled", note: `Settled, ${status.state} on mainnet.` });
            return;
          }
          if (status.state === "failed") {
            update(mint, { phase: "failed", note: `Mainnet ran the transaction and it failed: ${status.detail}. No USDC was spent on this purchase.` });
            return;
          }
        } catch {
          // A missed poll is retried; the signature stays on screen either way.
        }
      }
      update(mint, { note: "No confirmation within a minute. The signature below shows where it stands." });
    },
    [update],
  );

  const active = legs.find((leg) => leg.phase === "prepared" && leg.prepared && secondsUntil(leg.prepared.expiresAt, now) > 0);
  const inFlight = legs.find((leg) => leg.phase === "signing" || leg.phase === "sending");

  const approveAndSign = async () => {
    const leg = active;
    if (!leg?.prepared || !signTransaction) return;
    update(leg.mint, { phase: "signing", note: undefined });
    let signed: VersionedTransaction;
    try {
      signed = await signTransaction(VersionedTransaction.deserialize(fromBase64(leg.prepared.transaction)));
    } catch (error) {
      update(leg.mint, { phase: "prepared", note: `Not signed: ${reasonFrom(error)}` });
      return;
    }
    update(leg.mint, { phase: "sending" });
    try {
      const { signature } = await postJson<{ signature: string }>("/api/allocation/submit", {
        transaction: toBase64(signed.serialize()),
        approval: leg.prepared.approval,
      });
      update(leg.mint, { signature, note: "Sent. Waiting for mainnet to confirm." });
      void watch(leg.mint, signature);
    } catch (error) {
      update(leg.mint, { phase: "failed", note: `${reasonFrom(error)} No USDC was spent on this purchase.` });
    }
  };

  const keyDisabledReason = unavailable
    ? unavailable
    : !connected
      ? "Connect a wallet first."
      : !signTransaction
        ? "This wallet does not offer transaction signing."
        : inFlight
          ? `${phaseLabel[inFlight.phase]} ${inFlight.symbol}.`
          : !active
            ? "Preview a purchase to see its terms first."
            : undefined;

  const attempted = legs.filter((leg) => leg.phase === "settled" || leg.phase === "failed");
  const settledCount = legs.filter((leg) => leg.phase === "settled").length;
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

      <StepTrack label="Allocation steps" steps={steps} current={step} onStep={(index) => !started && setStep(index)} />

      <div className={styles.workspace}>
        <div className={styles.builder}>
          {step === 0 ? (
              <section className={styles.section} aria-label="Choose the constituents">
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
                        <div className={styles.lotRegister}>
                          <div className={styles.lotChoice}>
                            <label className={styles.lotToggle}>
                              <input
                                type="checkbox"
                                aria-label={`Add ${lot.symbol} to the basket`}
                                disabled={started}
                                checked={selected.includes(lot.mint)}
                                onChange={(event) =>
                                  setSelected((current) =>
                                    event.target.checked ? [...current, lot.mint] : current.filter((mint) => mint !== lot.mint),
                                  )
                                }
                              />
                            </label>
                            <Link className={styles.lotDetail} href={`/app/instruments/${encodeURIComponent(lot.mint)}`} aria-label={`Open ${lot.symbol} assay`}>
                              <LotMark symbol={lot.symbol} src={logoFor(lot.mint)} size="header" />
                              <span>
                                <b>{lot.symbol}</b>
                                <small>{lot.issuer}</small>
                                <small>Measured capacity {formatAmount(BigInt(lot.capacityUsdc), 0)} USDC</small>
                              </span>
                            </Link>
                          </div>
                          <div className={styles.lotMarks}>
                            <MarkLine grade={lot.grade} stamp={lot.decision === "ALLOW" ? "allow" : "warn"} reason={lot.stampReason} />
                          </div>
                        </div>
                        <details className={styles.conditionDisclosure}>
                          <summary>Read condition report</summary>
                          <ConditionReport statements={lot.prerogatives} evidence={`Read at slot ${lot.slot}. ${lot.multiplier}`} />
                        </details>
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
                inputMode="decimal"
                autoComplete="off"
                placeholder="250"
                value={typed}
                disabled={started}
                invalid={Boolean(amountProblem)}
                message={amountProblem ?? (legs.length > 0 ? describeSplit(legs, USDC_SCALE, "USDC") : "Seametry divides one total evenly across what you chose.")}
                onChange={(event) => setTyped(event.target.value)}
              />
            </section>
          ) : null}

          {step === 1 && legs.length > 0 ? (
            <>
              {/* On a phone the order sheet is not beside the steps, so the
                  step where signing happens carries it. */}
              <div className={styles.orderInline} data-testid="order-sheet-inline">{orderSummary}</div>
              <section className={styles.section} aria-label="Review each purchase">
                <p className={styles.quiet}>Each purchase is quoted and simulated separately before it can be signed.</p>
                <ol className={styles.legs}>
                  {legs.map((leg) => {
                    const secondsLeft = leg.prepared ? secondsUntil(leg.prepared.expiresAt, now) : 0;
                    return (
                      <li key={leg.mint} className={styles.leg} data-phase={leg.phase}>
                        <header>
                          <b>
                            {leg.symbol}, {formatAmount(leg.atoms, USDC_SCALE)} USDC
                          </b>
                          <span>{phaseLabel[leg.phase]}</span>
                        </header>
                        {leg.phase === "preparing" ? (
                          <p className={styles.loading}>Loading quotes for {formatAmount(leg.atoms, USDC_SCALE)} USDC</p>
                        ) : null}
                        {leg.prepared && (leg.phase === "prepared" || leg.phase === "signing" || leg.phase === "sending") ? (
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
                        {leg.phase === "idle" || (leg.phase === "prepared" && secondsLeft === 0) ? (
                          <QuietAction disabled={!connected || Boolean(unavailable)} onClick={() => void prepare(leg, chosen.map((lot) => lot.mint))}>
                            {leg.phase === "idle" ? "Preview purchase" : "Refresh quote"}
                          </QuietAction>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
                {attempted.length > 0 ? (
                  <p className={styles.summary} role="status">
                    {settledCount} of {legs.length} {legs.length === 1 ? "purchase" : "purchases"} settled.
                    {attempted.length === legs.length && settledCount < legs.length ? " The rest were not bought; no USDC was spent on them." : ""}
                  </p>
                ) : null}
                {started && !inFlight ? <QuietAction onClick={startOver}>Start new allocation</QuietAction> : null}
              </section>
            </>
          ) : null}
        </div>

        <aside className={styles.orderRail} aria-label="Order sheet">
          <div className={styles.orderRailInner}>{orderSummary}</div>
        </aside>
      </div>

      <StepBar
        // On Buy the bar carries the Key, and its line says what the Key waits
        // for, as Compose's bar does for Found.
        plan={planLine}
        problem={false}
        back={
          step === 1 ? (
            <QuietAction icon="back" disabled={Boolean(backReason)} title={backReason} onClick={() => setStep(0)}>
              Back
            </QuietAction>
          ) : undefined
        }
        next={
          step === 0 ? (
            <ContinueAction disabled={Boolean(continueReason)} title={continueReason} onClick={() => setStep(1)}>
              Set amount
            </ContinueAction>
          ) : !connected ? (
            <ContinueAction onClick={() => document.getElementById("app-wallet")?.click()}>Connect wallet</ContinueAction>
          ) : active || inFlight ? (
            <Key busy={Boolean(inFlight)} busyLabel={inFlight ? phaseLabel[inFlight.phase] : undefined} disabled={Boolean(keyDisabledReason) && !inFlight} onClick={() => void approveAndSign()}>
              {active ? `Approve and sign ${active.symbol}` : "Approve and sign"}
            </Key>
          ) : (
            <span>Preview a purchase above</span>
          )
        }
      />
    </div>
  );
}
