"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { QuietLink } from "@seametry/ui";
import { Icon, type IconName } from "@seametry/ui/icons";
import { Id, solscan } from "@seametry/ui/id";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import { StatusMark, Timeline, TimelineItem, type MarkState } from "@seametry/ui/timeline";
import { Toast, ToastRegion } from "@seametry/ui/toast";
import { Callout } from "@seametry/ui/callout";
import { formatAmount } from "@/lib/amount";
import { deriveState, endedAt, hasSignature, headline, isTerminal, LEG_WORDS, nextAction, outcomeLine, progressLine, retryWeights, type Execution, type ExecutionState, type Leg, type Quantity } from "@/lib/execution/record";
import { useHistory, type RecordState } from "@/lib/execution/history";
import { executions } from "@/lib/execution/store";
import { useExecutionWatcher } from "@/lib/execution/watcher";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import styles from "./activity.module.css";

// How recently a request may have ended for a page opened since to toast it,
// covering a refresh just after the last leg landed.
const RECENTLY_ENDED_MS = 10_000;

const MARKS: Record<ExecutionState, MarkState> = {
  settling: "running",
  "needs-attention": "running",
  settled: "done",
  "partly-settled": "partial",
  "nothing-moved": "stopped",
};

function legMark(leg: Leg): MarkState {
  if (leg.phase === "landed") return "done";
  return isTerminal(leg) ? "stopped" : "running";
}

function quantity(value: Quantity) {
  return `${formatAmount(value.atoms, value.scale)} ${value.unit}`;
}

/** The clock ticks while `running` says so, so a record turns from settling to needs-attention, and a toast leaves, on time. */
function useNow(keepRunning: (now: number) => boolean) {
  const [now, setNow] = useState(() => Date.now());
  const running = keepRunning(now);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

type Step = { href: string; label: string; icon: IconName; external?: boolean };

/** The one next step a record allows, as a destination, so the Activity list and the toast offer the same thing. */
function nextStep(execution: Execution, now: number): Step | undefined {
  const next = nextAction(execution, now);
  switch (next.kind) {
    case "view-holdings":
      return { href: "/app/positions", label: "View holdings", icon: "next" };
    case "retry": {
      if (execution.kind === "sell") return { href: "/app/positions", label: "Sell again", icon: "refresh" };
      const weights = retryWeights(next.legs);
      const total = next.legs.reduce((sum, leg) => sum + BigInt(leg.spend.atoms), 0n);
      const query = new URLSearchParams({ selected: next.legs.map((leg) => leg.mint).join(","), amount: formatAmount(total, 6).replaceAll(",", "") });
      if (weights) query.set("weights", next.legs.map((leg) => weights[leg.mint]).join(","));
      return { href: `/app/baskets/build?${query.toString()}`, label: next.legs.length === execution.legs.length ? "Buy again" : `Buy the other ${next.legs.length}`, icon: "refresh" };
    }
    case "read-chain":
      return { href: solscan(next.signature), label: "Read on Solscan", icon: "external", external: true };
    case "none":
      return undefined;
  }
}

function NextStep({ execution, now }: { execution: Execution; now: number }) {
  const step = nextStep(execution, now);
  if (!step) return null;
  return step.external
    ? <QuietLink href={step.href} target="_blank" rel="noreferrer" icon={step.icon}>{step.label}</QuietLink>
    : <QuietLink href={step.href} icon={step.icon}>{step.label}</QuietLink>;
}

/** The same step as the toast's icon: its label is the accessible name and the tooltip. */
function NextStepIcon({ step }: { step: Step }) {
  return step.external
    ? <a href={step.href} target="_blank" rel="noreferrer" aria-label={step.label} title={step.label}><Icon name={step.icon} /></a>
    : <Link href={step.href} aria-label={step.label} title={step.label}><Icon name={step.icon} /></Link>;
}

const RECORDED_BY: Record<NonNullable<Execution["recordedBy"]> | "browser", string> = {
  browser: "From this browser",
  server: "From Seametry's record",
  chain: "Found on chain",
};

/** Whose word a leg's phase is: the chain's, through Seametry's record, or not yet anyone's. */
function legSource(execution: Execution, leg: Leg): string | undefined {
  if (!execution.recordedBy) return undefined;
  if (leg.chainConfirmed) return "Confirmed on chain";
  return leg.phase === "refused" ? undefined : "Sent; Seametry has no answer from mainnet for it yet";
}

/** Which records this list holds, in one line, so a reader knows whether another device's trades could be missing. */
export function RecordLine({ record }: { record: RecordState }) {
  switch (record.state) {
    case "reading":
      return null;
    case "signed-out":
      return <p className={styles.recordLine}>This browser&apos;s records only. Sign in and link this wallet to include trades made on other devices.</p>;
    case "recorded":
      return <p className={styles.recordLine}>This browser&apos;s records and Seametry&apos;s record for {record.wallets.length === 1 ? "your linked wallet" : `your ${record.wallets.length} linked wallets`}, read {new Date(record.readAt).toLocaleTimeString()}.</p>;
    case "unavailable":
      return <Callout title="Seametry's record could not be read">Only this browser&apos;s records are shown. Trades made on other devices are missing until it can be read again.</Callout>;
  }
}

/** Every record for a wallet, newest first: this browser's, and Seametry's when signed in. */
export function ActivityList({ records, focus, record }: { records: Execution[]; focus?: string; record?: RecordState }) {
  const now = useNow(() => records.some((execution) => !execution.legs.every(isTerminal)));
  const focused = useRef<HTMLElement>(null);
  useEffect(() => {
    focused.current?.scrollIntoView({ block: "nearest" });
  }, [focus]);
  const line = record ? <RecordLine record={record} /> : null;
  if (records.length === 0) {
    return <>
      {line}
      {record?.state === "recorded"
        ? <Callout title="Nothing bought or sold yet">Neither this browser nor Seametry&apos;s record holds a purchase or sale for this wallet.</Callout>
        : <Callout title="Nothing bought or sold from this browser yet">Each purchase and sale you sign here is kept with what it spent, what it received and its signature.</Callout>}
    </>;
  }
  return (
    <div className={styles.list}>
      {line}
      {records.map((execution) => {
        const state = deriveState(execution, now);
        return (
          <article key={execution.id} ref={execution.id === focus ? focused : undefined} className={styles.record} data-state={state} aria-label={headline(execution, now)}>
            <header className={styles.recordHead}>
              <StatusMark state={MARKS[state]} />
              <div>
                <h3>{headline(execution, now)}</h3>
                <p>{outcomeLine(execution, now)}</p>
              </div>
              <time dateTime={execution.createdAt} title={new Date(execution.createdAt).toLocaleString()}>{relativeEvidenceAge(execution.createdAt, now)}</time>
            </header>
            <p className={styles.recordSource} data-recorded-by={execution.recordedBy ?? "browser"}>{RECORDED_BY[execution.recordedBy ?? "browser"]}</p>
            <Timeline label={`${headline(execution, now)}, by constituent`}>
              {execution.legs.map((leg) => (
                <TimelineItem
                  key={leg.signature}
                  state={legMark(leg)}
                  title={leg.symbol}
                  meta={leg.received ? `${quantity(leg.spend)} for ${quantity(leg.received)}` : quantity(leg.spend)}
                >
                  <span className={styles.legState} data-phase={leg.phase}>{LEG_WORDS[leg.phase]}</span>
                  {legSource(execution, leg) ? <p className={styles.legSource}>{legSource(execution, leg)}</p> : null}
                  {leg.problem ? <p className={styles.legProblem}>{leg.problem.plain}</p> : null}
                  {leg.problem?.technical ? (
                    <details className={styles.technical}>
                      <summary>Technical detail</summary>
                      <pre>{leg.problem.technical}</pre>
                    </details>
                  ) : null}
                  {hasSignature(leg) ? <Id value={leg.signature} label={`${leg.symbol} signature`} href={solscan(leg.signature)} /> : null}
                </TimelineItem>
              ))}
            </Timeline>
            <footer className={styles.recordFoot}>
              <NextStep execution={execution} now={now} />
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Mounted once in the App shell: the watcher, the toasts, and the Activity
 * icon with its sheet. A toast shows while its request runs and for a few
 * seconds after it ends; a request that ended while nobody was looking is
 * counted on the icon instead.
 */
export function ActivityDock() {
  useExecutionWatcher();
  // With no wallet connected, every record this browser holds is shown,
  // with Seametry's for every linked wallet when signed in.
  const { records, record } = useHistory(useWallet().publicKey?.toBase58());
  const [sheet, setSheet] = useState<{ focus?: string }>();
  const now = useNow((current) => records.some((execution) => endedAt(execution) === undefined || current - endedAt(execution)! < RECENTLY_ENDED_MS));
  const [dismissed, setDismissed] = useState<string[]>([]);
  // A request that ended before this page opened is counted on the icon, not
  // toasted; one that ends while the page is open stays until its countdown
  // runs out or it is dismissed.
  const [openedAt] = useState(() => Date.now());

  // Only what this browser asked for is toasted; another device's trade is history here, not news.
  const toasts = records.filter((execution) => {
    if (execution.recordedBy || dismissed.includes(execution.id)) return false;
    const ended = endedAt(execution);
    return ended === undefined || ended >= openedAt - RECENTLY_ENDED_MS;
  }).slice(0, 3).reverse();
  const unread = records.filter((execution) => !execution.seen && execution.legs.every(isTerminal)).length;

  const show = (focus?: string) => {
    setSheet({ focus });
    executions.markSeen(records.filter((execution) => execution.legs.every(isTerminal)).map((execution) => execution.id));
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => show()} aria-label={unread ? `Activity, ${unread} new` : "Activity"} data-testid="activity-trigger">
        <Icon name="activity" />
        {unread ? <span className={styles.count} aria-hidden="true">{unread}</span> : null}
      </button>
      <ModalSheet open={Boolean(sheet)} onClose={() => setSheet(undefined)} title="Activity" register={record.state === "recorded" ? "Mainnet, linked wallets" : "Mainnet, this browser"} closeLabel="Hide activity">
        <ActivityList records={records} focus={sheet?.focus} record={record} />
      </ModalSheet>
      <ToastRegion label="Requests in progress">
        {toasts.map((execution) => {
          const state = deriveState(execution, now);
          return (
            <Toast
              key={execution.id}
              state={MARKS[state]}
              title={headline(execution, now)}
              line={state === "settling" ? progressLine(execution) : outcomeLine(execution, now)}
              action={nextStep(execution, now) ? <NextStepIcon step={nextStep(execution, now)!} /> : undefined}
              countdown={state !== "settling" && state !== "needs-attention"}
              onOpen={() => show(execution.id)}
              openLabel={`${headline(execution, now)}, show in Activity`}
              onDismiss={() => {
                setDismissed((current) => [...current, execution.id]);
                if (execution.legs.every(isTerminal)) executions.markSeen([execution.id]);
              }}
              dismissLabel={`Dismiss ${headline(execution, now)}`}
            />
          );
        })}
      </ToastRegion>
    </>
  );
}
