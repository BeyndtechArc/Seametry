"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { ConditionReport, Field, Grade, Key, LotMark, QuietAction, QuoteBlock, Rule, Stamp, type GradeName } from "@seametry/ui";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import { formatAmount, parseAmount, splitEvenly } from "@/lib/amount";
import type { PreparedLeg } from "@/lib/allocation/execution";
import { logoFor } from "@/lib/instrument-logos";
import { ROUTING_FEE_BPS, USDC_SCALE, lotCapAtoms, routingFeeAtoms } from "@/lib/allocation/rules";
import styles from "./allocation.module.css";

export type OfferedLot = {
  mint: string;
  symbol: string;
  issuer: string;
  grade: GradeName;
  decision: string;
  capacityUsdc: number;
  stampReason: string;
  prerogatives: string[];
  multiplier: string;
  slot: string;
};

export type RefusedLot = { symbol: string; fact: string };

type Snapshot = { asOf: string; age: string; policyVersion: string; referenceUsdc: number };

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
  wallet,
  readiness,
  inFlight,
  active,
  approveAndSign,
}: {
  selectedSymbols: string[];
  total: string;
  fee: string;
  wallet?: string;
  readiness?: string;
  inFlight?: Leg;
  active?: Leg;
  approveAndSign: () => void;
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
          <dt>Seametry routing fee, {formatAmount(BigInt(ROUTING_FEE_BPS), 2)}%</dt>
          <dd>{fee}</dd>
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
      <p className={styles.orderReadiness}>{readiness ?? "The next prepared purchase is ready for your approval."}</p>
      <div className={styles.orderKey}>
        <Key
          busy={Boolean(inFlight)}
          busyLabel={inFlight ? phaseLabel[inFlight.phase] : undefined}
          disabled={Boolean(readiness) && !inFlight}
          disabledReason={readiness}
          onClick={approveAndSign}
        >
          {active ? `Approve and sign ${active.symbol}` : "Approve and sign"}
        </Key>
      </div>
    </div>
  );
}

export function AllocationFlow({
  offered,
  refused,
  snapshot,
  unavailable,
}: {
  offered: OfferedLot[];
  refused: RefusedLot[];
  snapshot: Snapshot;
  unavailable?: string;
}) {
  const { publicKey, connected, signTransaction } = useWallet();
  const [selected, setSelected] = useState<string[]>(offered.map((lot) => lot.mint));
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState<{ plan: string; changes: Record<string, Partial<Leg>> }>({ plan: "", changes: {} });
  const [now, setNow] = useState(() => Date.now());
  const [orderOpen, setOrderOpen] = useState(false);

  const parsed = typed.trim() === "" ? undefined : parseAmount(typed, USDC_SCALE);
  const chosen = offered.filter((lot) => selected.includes(lot.mint));
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
  const plan = `${typed}|${selected.join(",")}`;
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
  };

  const prepare = useCallback(
    async (leg: Leg) => {
      if (!publicKey) return;
      update(leg.mint, { phase: "preparing", note: undefined, prepared: undefined });
      try {
        const prepared = await postJson<PreparedLeg>("/api/allocation/prepare", {
          wallet: publicKey.toBase58(),
          mint: leg.mint,
          usdcAtoms: leg.atoms.toString(),
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
  const fee = split.length > 0 ? `${formatAmount(split.reduce((sum, atoms) => sum + routingFeeAtoms(atoms), 0n), USDC_SCALE)} USDC` : "Not set";
  const orderSummary = (
    <OrderSummary
      selectedSymbols={chosen.map((lot) => lot.symbol)}
      total={total}
      fee={fee}
      wallet={publicKey?.toBase58()}
      readiness={keyDisabledReason}
      inFlight={inFlight}
      active={active}
      approveAndSign={() => void approveAndSign()}
    />
  );

  return (
    <div className={styles.flow}>
      {unavailable ? (
        <p className={styles.unavailable} role="note">
          {unavailable}
        </p>
      ) : null}

      <div className={styles.workspace}>
        <div className={styles.builder}>
          <section className={styles.section} aria-labelledby="amount-heading">
            <Rule />
            <h2 id="amount-heading">Set the basket amount</h2>
            <p className={styles.quiet}>Set one total. Seametry divides it evenly across the constituents you keep in the plan.</p>
            <Field
              id="allocation-usdc"
              label="USDC to spend"
              inputMode="decimal"
              autoComplete="off"
              placeholder="250"
              value={typed}
              disabled={started}
              invalid={Boolean(amountProblem)}
              message={
                amountProblem ??
                (legs.length > 0
                  ? `Split evenly: ${legs.map((leg) => `${formatAmount(leg.atoms, USDC_SCALE)} USDC to ${leg.symbol}`).join("; ")}.`
                  : chosen.length === 0
                    ? "Select at least one constituent."
                    : undefined)
              }
              onChange={(event) => setTyped(event.target.value)}
            />
          </section>

          <section className={styles.section} aria-labelledby="lots-heading">
            <Rule />
            <h2 id="lots-heading">Choose the constituents</h2>
            <p className={styles.provenance}>
              Policy {snapshot.policyVersion}, captured{" "}
              <time dateTime={snapshot.asOf} title={snapshot.asOf}>
                {new Date(snapshot.asOf).toUTCString().slice(5, 16)}
              </time>
              , {snapshot.age} old. This is a snapshot, not a live issuer read.
            </p>
            {offered.length === 0 ? (
              <p className={styles.quiet}>No instrument is eligible under this policy at the measured reference size.</p>
            ) : (
              <ul className={styles.lots}>
                {offered.map((lot) => (
                  <li key={lot.mint} className={styles.lot}>
                    <div className={styles.lotRegister}>
                      <label className={styles.lotChoice}>
                        <input
                          type="checkbox"
                          disabled={started}
                          checked={selected.includes(lot.mint)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, lot.mint] : current.filter((mint) => mint !== lot.mint),
                            )
                          }
                        />
                        <LotMark symbol={lot.symbol} src={logoFor(lot.mint)} size="list" />
                        <span>
                          <b>{lot.symbol}</b>
                          <small>{lot.issuer}</small>
                          <small>Measured capacity {formatAmount(BigInt(lot.capacityUsdc), 0)} USDC</small>
                        </span>
                      </label>
                      <div className={styles.lotMarks}>
                        <Grade name={lot.grade} />
                        <Stamp kind={lot.decision === "ALLOW" ? "allow" : "warn"} reason={lot.stampReason} />
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

          {legs.length > 0 ? (
            <section className={styles.section} aria-labelledby="legs-heading">
              <Rule />
              <h2 id="legs-heading">Review each purchase</h2>
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
                              { label: `Seametry routing fee, ${formatAmount(BigInt(ROUTING_FEE_BPS), 2)}%`, value: `${formatAmount(leg.prepared.routingFeeAtoms, USDC_SCALE)} USDC` },
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
                        <QuietAction disabled={!connected || Boolean(unavailable)} onClick={() => void prepare(leg)}>
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
          ) : null}
        </div>

        <aside className={styles.orderRail} aria-label="Order sheet">
          <div className={styles.orderRailInner}>{orderSummary}</div>
        </aside>
      </div>

      <div className={styles.mobileOrderTrigger}>
        <QuietAction onClick={() => setOrderOpen(true)}>Review order sheet</QuietAction>
        <span>{total}</span>
      </div>
      <ModalSheet open={orderOpen} onClose={() => setOrderOpen(false)} title="Order sheet" register="Allocation" closeLabel="Close order sheet">
        {orderSummary}
      </ModalSheet>
    </div>
  );
}
