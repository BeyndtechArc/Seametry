"use client";

import { useEffect, useMemo, useState } from "react";
import type { Execution } from "./record";
import { fromServer, mergeHistory, type HistoryAnswer } from "./server-history";
import { useExecutions } from "./store";

export type RecordState =
  | { state: "reading" }
  | { state: "signed-out" }
  | { state: "recorded"; wallets: string[]; readAt: string }
  | { state: "unavailable"; detail: string };

// One read serves every surface mounted at once (the dock and Holdings),
// and is repeated only after this long, or when a request ends.
const FRESH_MS = 30_000;
let last: { at: number; key: number; answer: Promise<HistoryAnswer> } | undefined;

function read(key: number): Promise<HistoryAnswer> {
  if (last && last.key === key && Date.now() - last.at < FRESH_MS) return last.answer;
  const answer = fetch("/api/history", { cache: "no-store" })
    .then(async (response) => {
      const body = (await response.json().catch(() => undefined)) as HistoryAnswer | undefined;
      if (body && (body.state === "signed-out" || body.state === "recorded" || body.state === "unavailable")) return body;
      return { state: "unavailable", detail: `The history route answered ${response.status}.` } as const;
    })
    .catch((error: unknown) => ({ state: "unavailable", detail: error instanceof Error ? error.message : String(error) }) as const);
  last = { at: Date.now(), key, answer };
  return answer;
}

/**
 * This browser's records merged with Seametry's record of the signed-in
 * account's linked wallets, filtered to one wallet when given. Signed out,
 * this is this browser's records alone, as before.
 */
export function useHistory(wallet?: string): { records: Execution[]; record: RecordState } {
  const local = useExecutions(wallet);
  // A request that ends changes what Seametry's record holds, so it is read again.
  const ended = local.filter((execution) => execution.legs.every((leg) => leg.phase !== "signed" && leg.phase !== "sent")).length;
  const [answer, setAnswer] = useState<HistoryAnswer>();
  useEffect(() => {
    let current = true;
    void read(ended).then((next) => {
      if (current) setAnswer(next);
    });
    return () => {
      current = false;
    };
  }, [ended]);
  return useMemo(() => {
    if (!answer) return { records: local, record: { state: "reading" } };
    if (answer.state !== "recorded") return { records: local, record: answer };
    const server = fromServer(answer.executions).filter((execution) => !wallet || execution.wallet === wallet);
    return { records: mergeHistory(local, server), record: { state: "recorded", wallets: answer.wallets, readAt: answer.readAt } };
  }, [answer, local, wallet]);
}
