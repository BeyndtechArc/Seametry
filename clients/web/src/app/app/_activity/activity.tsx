"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { LotMark, QuietLink } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { Id, solscan } from "@seametry/ui/id";
import { ModalSheet } from "@seametry/ui/modal-sheet";
import { StatusMark, Timeline, TimelineItem, type MarkState } from "@seametry/ui/timeline";
import { Toast, ToastRegion } from "@seametry/ui/toast";
import { Callout } from "@seametry/ui/callout";
import { formatAmount } from "@/lib/amount";
import { logoSrc } from "@/lib/logo-src";
import { deriveState, endedAt, hasSignature, headline, isTerminal, LEG_WORDS, nextAction, outcomeLine, progressLine, retryWeights, type Execution, type ExecutionState, type Leg, type Quantity } from "@/lib/execution/record";
import { executions, useExecutions } from "@/lib/execution/store";
import { useExecutionWatcher } from "@/lib/execution/watcher";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import styles from "./activity.module.css";

// A finished request stays in the corner this long, then lives on in Activity.
const SHOWN_AFTER_FINISH_MS = 6_000;

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

function NextStep({ execution, now }: { execution: Execution; now: number }) {
  const next = nextAction(execution, now);
  switch (next.kind) {
    case "view-holdings":
      return <QuietLink href="/app/positions" icon="next">View holdings</QuietLink>;
    case "retry": {
      if (execution.kind === "sell") return <QuietLink href="/app/positions" icon="next">Sell again</QuietLink>;
      const weights = retryWeights(next.legs);
      const total = next.legs.reduce((sum, leg) => sum + BigInt(leg.spend.atoms), 0n);
      const query = new URLSearchParams({ selected: next.legs.map((leg) => leg.mint).join(","), amount: formatAmount(total, 6).replaceAll(",", "") });
      if (weights) query.set("weights", next.legs.map((leg) => weights[leg.mint]).join(","));
      return <QuietLink href={`/app/baskets/build?${query.toString()}`} icon="next">{next.legs.length === execution.legs.length ? "Buy again" : `Buy the other ${next.legs.length}`}</QuietLink>;
    }
    case "read-chain":
      return <QuietLink href={solscan(next.signature)} target="_blank" rel="noreferrer" icon="external">Read on Solscan</QuietLink>;
    case "none":
      return null;
  }
}

function Marks({ legs }: { legs: Leg[] }) {
  return (
    <span className={styles.marks} aria-hidden="true">
      {legs.slice(0, 3).map((leg) => <LotMark key={leg.mint} symbol={leg.symbol} src={logoSrc(leg.mint)} size="list" />)}
      {legs.length > 3 ? <span className={styles.more}>+{legs.length - 3}</span> : null}
    </span>
  );
}

/** Every record for a wallet, newest first: the lasting account of what this browser asked for. */
export function ActivityList({ records, focus }: { records: Execution[]; focus?: string }) {
  const now = useNow(() => records.some((execution) => !execution.legs.every(isTerminal)));
  const focused = useRef<HTMLElement>(null);
  useEffect(() => {
    focused.current?.scrollIntoView({ block: "nearest" });
  }, [focus]);
  if (records.length === 0) return <Callout title="Nothing bought or sold from this browser yet">Each purchase and sale you sign here is kept with what it spent, what it received and its signature.</Callout>;
  return (
    <div className={styles.list}>
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
            <Timeline label={`${headline(execution, now)}, by constituent`}>
              {execution.legs.map((leg) => (
                <TimelineItem
                  key={leg.signature}
                  state={legMark(leg)}
                  title={leg.symbol}
                  meta={leg.received ? `${quantity(leg.spend)} for ${quantity(leg.received)}` : quantity(leg.spend)}
                >
                  <span>{LEG_WORDS[leg.phase]}{leg.problem ? `. ${leg.problem.plain}` : ""}</span>
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
  // With no wallet connected, every record this browser holds is shown.
  const records = useExecutions(useWallet().publicKey?.toBase58());
  const [sheet, setSheet] = useState<{ focus?: string }>();
  const now = useNow((current) => records.some((execution) => {
    const ended = endedAt(execution);
    return ended === undefined || current - ended < SHOWN_AFTER_FINISH_MS;
  }));
  const [dismissed, setDismissed] = useState<string[]>([]);

  const toasts = records.filter((execution) => {
    if (dismissed.includes(execution.id)) return false;
    const ended = endedAt(execution);
    return ended === undefined || now - ended < SHOWN_AFTER_FINISH_MS;
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
      <ModalSheet open={Boolean(sheet)} onClose={() => setSheet(undefined)} title="Activity" register="Mainnet, this browser" closeLabel="Hide activity">
        <ActivityList records={records} focus={sheet?.focus} />
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
              lead={<Marks legs={execution.legs} />}
              action={nextAction(execution, now).kind === "none" ? undefined : <NextStep execution={execution} now={now} />}
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
