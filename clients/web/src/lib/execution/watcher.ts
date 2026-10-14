import { useEffect } from "react";
import { hasSignature, LEG_PROBLEMS, receivedFrom, type BalanceChange, type Execution, type Judgement, type Leg } from "./record";
import { executions, useExecutions } from "./store";

const TICK_MS = 2_000;
const MOST_BACKOFF_MS = 16_000;
const BATCH = 32;

type Reading = Judgement & { signature: string; changes?: BalanceChange[] };

function isOpen(leg: Leg) {
  return (leg.phase === "signed" || leg.phase === "sent") && hasSignature(leg);
}

function settle(execution: Execution, leg: Leg, reading: Reading, endedAt: string): Leg {
  switch (reading.phase) {
    case "landed": {
      const received = receivedFrom(execution.kind, leg, reading.changes ?? []);
      return { ...leg, phase: "landed", endedAt, ...(received ? { received } : {}) };
    }
    case "failed":
      return { ...leg, phase: "failed", endedAt, problem: { plain: LEG_PROBLEMS.failed, technical: reading.technical } };
    case "dropped":
      return { ...leg, phase: "dropped", endedAt, problem: { plain: LEG_PROBLEMS.dropped } };
    case "sent":
      // Unseen inside its deadline is no news; a signed leg stays signed
      // until its own send receipt or the chain says otherwise.
      return leg;
  }
}

async function readChain(open: { execution: Execution; leg: Leg }[]): Promise<Reading[]> {
  const readings: Reading[] = [];
  for (let start = 0; start < open.length; start += BATCH) {
    const legs = open.slice(start, start + BATCH).map(({ execution, leg }) => ({
      signature: leg.signature,
      wallet: execution.wallet,
      signedAt: leg.signedAt,
      ...(leg.lastValidBlockHeight !== undefined ? { lastValidBlockHeight: leg.lastValidBlockHeight } : {}),
    }));
    const response = await fetch("/api/execution/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ legs }), cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { legs?: Reading[]; error?: string };
    if (!response.ok || !body.legs) throw new Error(body.error ?? `The status route answered ${response.status}.`);
    readings.push(...body.legs);
  }
  return readings;
}

/**
 * The one loop that watches every open leg in this browser, mounted once in
 * the App shell, so a record keeps settling across navigation and a refresh.
 * A failed read doubles the wait up to 16 seconds and marks the affected
 * records unreadable; the record, not this loop, decides when that is worth
 * telling the holder (record.ts, UNREADABLE_AFTER_MS).
 */
export function useExecutionWatcher() {
  const all = useExecutions();
  const openKey = all.flatMap((execution) => execution.legs.filter(isOpen).map((leg) => leg.signature)).join(",");

  useEffect(() => {
    if (!openKey) return;
    let cancelled = false;
    let delay = TICK_MS;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const open = executions.all().flatMap((execution) => execution.legs.filter(isOpen).map((leg) => ({ execution, leg })));
      if (open.length === 0) return;
      const touched = [...new Set(open.map(({ execution }) => execution.id))];
      try {
        const readings = new Map((await readChain(open)).map((reading) => [reading.signature, reading]));
        delay = TICK_MS;
        const at = new Date().toISOString();
        touched.forEach((id) => executions.update(id, (execution) => {
          const next: Execution = {
            ...execution,
            legs: execution.legs.map((leg) => {
              const reading = isOpen(leg) ? readings.get(leg.signature) : undefined;
              return reading ? settle(execution, leg, reading, at) : leg;
            }),
          };
          delete next.unreadable;
          return next;
        }));
      } catch (error) {
        delay = Math.min(delay * 2, MOST_BACKOFF_MS);
        const detail = error instanceof Error ? error.message : String(error);
        const now = new Date().toISOString();
        touched.forEach((id) => executions.update(id, (execution) => ({ ...execution, unreadable: { since: execution.unreadable?.since ?? now, detail } })));
      }
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [openKey]);
}
