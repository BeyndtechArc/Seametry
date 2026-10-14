"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { ActionBar, ContinueAction, Field, FilterBar, Key, LotMark, QuietAction, QuoteBlock, SelectionCount, StepBar, StepRegister, StepTrack, Stamp, type RegisterStep } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { Banner } from "@seametry/ui/banner";
import { Id } from "@seametry/ui/id";
import { Identity } from "@seametry/ui/list";
import { ProcessDialog } from "@seametry/ui/modal-sheet";
import { describeSplit, formatAmount, parseAmount, splitByWeights, splitEvenly } from "@/lib/amount";
import type { PreparedLeg } from "@/lib/allocation/execution";
import type { OfferedLot, RefusedLot } from "@/lib/allocation/offer";
import { shortIssuer } from "@/lib/issuers";
import { SLIPPAGE_BPS, USDC_SCALE, lotCapAtoms, minimumPlanAtoms, routingFeeAtoms, routingFeeBps } from "@/lib/allocation/rules";
import { approveAndSend, NotSent } from "@/lib/execution/run";
import styles from "./allocation.module.css";

/** The wait before the hand-off to Activity: quoting every leg, then the one wallet approval. */
type Attempt =
  | { stage: "checking" }
  | { stage: "approving"; prepared: PreparedLeg[] }
  | { stage: "stopped"; problem: BatchProblem };
type BatchProblem = { at: 0 | 1; plain: string; technical?: string };

type PlanLeg = { mint: string; symbol: string; atoms: bigint };

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly sent?: boolean) { super(message); }
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

function stoppedAllocation(error: unknown): BatchProblem {
  if (error instanceof NotSent) return { at: 1, plain: error.message };
  return {
    at: 0,
    plain: error instanceof TypeError
      ? "Seametry could not reach the route service. Nothing was signed or spent. Check the connection and try again."
      : `${reasonFrom(error)} Nothing was signed or spent.`,
    technical: error instanceof ApiError ? undefined : technicalFrom(error),
  };
}

function allocationSteps(attempt: Attempt): RegisterStep[] {
  const definitions = [
    { title: "Check every route", glyph: "assay" as const, note: "Quoting and simulating every constituent before your wallet is asked" },
    { title: "Approve in your wallet", glyph: "wallet" as const, note: "One approval signs every purchase where the wallet supports it. Activity follows them from there." },
  ];
  const active = attempt.stage === "checking" ? 0 : 1;
  return definitions.map((step, index) => {
    if (attempt.stage === "stopped") {
      const { at, plain, technical } = attempt.problem;
      return index === at ? { ...step, state: "stopped" as const, problem: { plain, technical } } : { ...step, state: index < at ? "done" as const : "waiting" as const };
    }
    return { ...step, state: index < active ? "done" as const : index === active ? "now" as const : "waiting" as const };
  });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new ApiError(payload.error ?? `${path} answered ${response.status}`, response.status, payload.code, payload.sent);
  return payload as T;
}

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
  const [attempt, setAttempt] = useState<Attempt>();
  const [progressHidden, setProgressHidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shortfall, setShortfall] = useState<string>();

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

  // The plan is derived from the inputs on every render, and locked only
  // while quoting and approval run; once signed it belongs to Activity.
  const legs: PlanLeg[] = amountProblem || split.length === 0 ? [] : chosen.map((lot, i) => ({ mint: lot.mint, symbol: lot.symbol, atoms: split[i] }));
  const started = attempt?.stage === "checking" || attempt?.stage === "approving";
  const prepared = attempt?.stage === "approving" ? attempt.prepared : undefined;
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
  }, [walletAddress]);

  // A wallet browser has a separate storage partition from Safari or Chrome.
  // Only unsigned plan inputs travel in the URL. A quote or approval must be
  // freshly prepared after the receiving wallet connects.
  useEffect(() => {
    if (started) return;
    keepUnsignedPlanInUrl({ mints: chosenMints ? chosenMints.split(",") : [], amount: typed, weights });
  }, [chosenMints, typed, weights, started]);

  useEffect(() => {
    if (!prepared) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [prepared]);

  // The page behind a closing dialog stays inert until the exit ends, so the
  // amount takes focus from the dialog's onClosed, not straight away.
  const focusAmountOnClose = useRef(false);
  const adjustAmount = () => {
    focusAmountOnClose.current = true;
    setShortfall(undefined);
  };

  /**
   * Quotes and simulates every leg, asks the wallet once, and hands the
   * signed purchases to the engine (lib/execution/run.ts). The dialog closes
   * on approval; the toast and Activity carry each purchase from there.
   */
  const buyAll = async () => {
    const signingWallet = walletAddress;
    if (!signingWallet || started || legs.length === 0) return;
    setProgressHidden(false);
    setAttempt({ stage: "checking" });
    let quoted: PreparedLeg[];
    try {
      quoted = await postJson<PreparedLeg[]>("/api/allocation/prepare-batch", {
        wallet: signingWallet,
        legs: legs.map((leg) => ({ mint: leg.mint, usdcAtoms: leg.atoms.toString() })),
        planMints: chosen.map((lot) => lot.mint),
      });
      if (quoted.length !== legs.length) throw new Error("The Allocation preflight returned an incomplete plan.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        // Not enough USDC or SOL: nothing was prepared. The holder is asked
        // to fund the wallet or lower the amount instead.
        setAttempt(undefined);
        setShortfall(reasonFrom(error));
      } else {
        setAttempt({ stage: "stopped", problem: stoppedAllocation(error) });
      }
      return;
    }
    if (currentWallet.current !== signingWallet) {
      setAttempt(undefined);
      return;
    }
    setAttempt({ stage: "approving", prepared: quoted });
    try {
      await approveAndSend({
        wallet: signingWallet,
        kind: "buy",
        subject: identity.name,
        allocation: { id: window.crypto.randomUUID(), name: identity.name, ...(identity.templateId ? { templateId: identity.templateId } : {}) },
        // The plan names each purchase; the quote supplies its terms.
        prepared: quoted.map((quote, index) => ({ ...quote, mint: legs[index].mint, symbol: legs[index].symbol })),
        signer: { signTransaction, signAllTransactions, connectedWallet: () => currentWallet.current },
      });
      setAttempt(undefined);
    } catch (error) {
      setAttempt({ stage: "stopped", problem: stoppedAllocation(error) });
    }
  };

  const keyDisabledReason = unavailable
    ? unavailable
    : !connected
      ? "Connect a wallet first."
      : !signTransaction && !signAllTransactions
        ? "This wallet does not offer transaction signing."
        : legs.length === 0
          ? amountProblem ?? "Enter the USDC to spend."
          : undefined;
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
  const backReason = started ? "Wait for the wallet, or stop, before changing the plan." : undefined;
  const planLine = [chosen.length === 0 ? "Nothing chosen" : `${chosen.length} chosen`, parsed && "atoms" in parsed ? total : ""].filter(Boolean).join(", ");

  return (
    <div className={styles.flow}>
      {unavailable ? <Banner tone="blocked">{unavailable}</Banner> : null}

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
                          <Link className={styles.lotDetail} href={`/app/instruments/${encodeURIComponent(lot.mint)}?from=allocation&selected=${encodeURIComponent(selected.join(","))}`} aria-label={`${lot.symbol} assay`}>
                            <Identity symbol={lot.symbol} name={lot.name} logo={lot.logo} issuer={shortIssuer(lot.issuer)} />
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
                <p className={styles.quiet}>One allocation decision, independently simulated purchases. Wallets with batch signing approve the set together; other wallets may show one prompt per purchase. Once approved, Activity follows each one.</p>
                <ol className={styles.legs}>
                  {legs.map((leg, index) => {
                    const quote = prepared?.[index];
                    return (
                      <li key={leg.mint} className={styles.leg}>
                        <header>
                          <b>
                            {leg.symbol}, {formatAmount(leg.atoms, USDC_SCALE)} USDC
                          </b>
                        </header>
                        {attempt?.stage === "checking" ? <p className={styles.loading}>Quoting {formatAmount(leg.atoms, USDC_SCALE)} USDC of {leg.symbol}</p> : null}
                        {quote ? (
                          <>
                            <QuoteBlock
                              floor={formatAmount(quote.floorAtoms, quote.outScale)}
                              expected={formatAmount(quote.outAtoms, quote.outScale)}
                              unit={leg.symbol}
                              fees={[
                                { label: `Seametry routing fee, ${formatAmount(BigInt(quote.routingFeeBps), 2)}%`, value: `${formatAmount(quote.routingFeeAtoms, USDC_SCALE)} USDC` },
                                { label: "Priority fee set by the route", value: `${formatAmount(quote.priorityFeeLamports, 9)} SOL` },
                                ...(quote.landing === "sender" ? [{ label: "Landing tip, paid by Seametry", value: `${formatAmount(quote.tipLamports, 9)} SOL` }] : []),
                                ...(quote.solNeededLamports ? [{ label: "SOL needed, including account opening", value: `${formatAmount(quote.solNeededLamports, 9)} SOL` }] : []),
                                { label: "Venue fees", value: "Included in the expected output" },
                              ]}
                              route={`Jupiter, through ${quote.route.join(", ")}, quoted at slot ${quote.contextSlot}`}
                              received={{ relative: `${Math.max(0, Math.floor((now - Date.parse(quote.receivedAt)) / 1000))}s`, absolute: quote.receivedAt }}
                              secondsLeft={secondsUntil(quote.expiresAt, now)}
                            />
                            <p className={styles.simulated}>
                              Simulated token changes on mainnet for this wallet:{" "}
                              {quote.simulated.map((change) => signedChange(change.atoms, change.scale, change.unit)).join("; ")}.
                            </p>
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            </>
          ) : null}
        {step === 0 ? (
          <ActionBar data-testid="selection-action-bar" summary={<SelectionCount current={chosen.length} total={offered.length} />}>
            <ContinueAction disabled={Boolean(continueReason)} title={continueReason} onClick={() => setStep(1)}>
              Set amount
            </ContinueAction>
          </ActionBar>
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
              ) : (
                <Key
                  busy={started}
                  busyLabel={attempt?.stage === "checking" ? "Checking every leg" : "Waiting for wallet"}
                  disabled={Boolean(keyDisabledReason)}
                  disabledReason={keyDisabledReason}
                  // The field already states an amount problem; the Key says it again only when pressed.
                  reasonBeside={false}
                  onClick={() => void buyAll()}
                >
                  {fixedTemplate ? "Buy basket" : "Buy allocation"}
                </Key>
              )
            }
          />
        )}
        </div>

        <aside className={styles.orderRail} aria-label="Order sheet">
          <div className={styles.orderRailInner}>{orderSummary}</div>
        </aside>
      </div>

      {attempt && !(started && progressHidden) ? (
        <ProcessDialog
          open
          onClose={() => (started ? setProgressHidden(true) : setAttempt(undefined))}
          title={attempt.stage === "stopped" ? "Purchase stopped" : `Buying ${identity.name}`}
          register={attempt.stage === "stopped" ? "Nothing was sent" : "Mainnet"}
          closeLabel={started ? "Hide purchase progress" : "Dismiss"}
          footer={attempt.stage === "stopped" ? <ContinueAction type="button" onClick={() => void buyAll()}>Try again</ContinueAction> : undefined}
        >
          <StepRegister label="Allocation progress" steps={allocationSteps(attempt)} />
        </ProcessDialog>
      ) : null}
      <ProcessDialog
        open={Boolean(shortfall)}
        onClose={() => setShortfall(undefined)}
        onClosed={() => {
          if (!focusAmountOnClose.current) return;
          focusAmountOnClose.current = false;
          document.getElementById("allocation-usdc")?.focus();
        }}
        title="Fund the wallet or lower the amount"
        register="Nothing was signed"
        closeLabel="Close"
        footer={<ContinueAction type="button" onClick={adjustAmount}>Adjust amount</ContinueAction>}
      >
        <p>{shortfall}</p>
        {walletAddress ? (
          <div className={styles.fundTo}>
            <span>Send to</span>
            <Id value={walletAddress} label="wallet address" />
          </div>
        ) : null}
        <p>Or lower the amount so it fits what the wallet holds. Nothing was prepared and nothing left the wallet.</p>
      </ProcessDialog>
    </div>
  );
}
