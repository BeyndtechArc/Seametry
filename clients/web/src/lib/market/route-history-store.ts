import "server-only";

import type { RouteObservation } from "./route-observations";
import { ROUTE_HISTORY_DAYS } from "./route-observations";

type RedisReply = { result?: unknown; error?: string };

function credentials(): { url: string; token: string } | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return undefined;
  // These are deployment-owned values; don't send a bearer token to HTTP.
  if (!url.startsWith("https://")) return undefined;
  return { url: url.replace(/\/$/, ""), token };
}

export function routeHistoryConfigured(): boolean {
  return Boolean(credentials());
}

const key = (mint: string) => "seametry:route-observations:v1:" + mint;

async function pipeline(commands: (string | number)[][]): Promise<RedisReply[]> {
  const config = credentials();
  if (!config) throw new Error("Persistent route observation storage is not configured.");
  const response = await fetch(config.url + "/pipeline", {
    method: "POST",
    headers: { authorization: "Bearer " + config.token, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Route history storage is unavailable (" + response.status + ").");
  const body: unknown = await response.json();
  if (!Array.isArray(body) || body.length !== commands.length) throw new Error("Route history storage returned an incomplete result.");
  return body as RedisReply[];
}

/** Read a bounded set of recorded quotes with one server-side REST round trip. */
export async function readRouteHistories(mints: string[]): Promise<Record<string, RouteObservation[]>> {
  if (!mints.length) return {};
  const unique = [...new Set(mints)];
  const response = await pipeline(unique.map((mint) => ["ZRANGE", key(mint), 0, -1]));
  const output: Record<string, RouteObservation[]> = {};
  response.forEach((entry, index) => {
    if (entry.error) throw new Error("Route history storage refused a read.");
    const mint = unique[index];
    const values = Array.isArray(entry.result) ? entry.result : [];
    output[mint] = values.flatMap((value): RouteObservation[] => {
      if (typeof value !== "string") return [];
      try {
        const parsed = JSON.parse(value) as Partial<RouteObservation>;
        if (parsed.schema === "seametry-route-observation-v1" && parsed.mint === mint) {
          return [parsed as RouteObservation];
        }
      } catch {
        // A damaged record is not a price observation.
      }
      return [];
    });
  });
  return output;
}

/**
 * Write signed-off research observations after sampling; keep only a short
 * rolling window. Values are the server's own Jupiter responses, not values
 * posted by arbitrary visitors.
 */
export async function saveRouteObservations(observations: RouteObservation[]): Promise<void> {
  if (!observations.length) return;
  const cutoff = Math.floor((Date.now() - ROUTE_HISTORY_DAYS * 86_400_000) / 1000);
  const commands = observations.flatMap((observation) => {
    const name = key(observation.mint);
    return [
      ["ZADD", name, Math.floor(Date.parse(observation.sampledAt) / 1000), JSON.stringify(observation)],
      ["ZREMRANGEBYSCORE", name, "-inf", "(" + cutoff],
    ];
  });
  const results = await pipeline(commands);
  if (results.some((entry) => entry.error)) throw new Error("Route observation storage rejected one or more records.");
}

/** Avoid duplicate daily samples if Vercel retries a cron invocation. */
export async function claimDailyObservationRun(day: string): Promise<boolean> {
  const config = credentials();
  if (!config) throw new Error("Persistent route observation storage is not configured.");
  const response = await fetch(config.url, {
    method: "POST",
    headers: { authorization: "Bearer " + config.token, "content-type": "application/json" },
    body: JSON.stringify(["SET", "seametry:route-run:v1:" + day, "active", "EX", 86_400, "NX"]),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Route observation lock is unavailable.");
  const body = await response.json() as RedisReply;
  if (body.error) throw new Error("Route observation lock failed.");
  return body.result === "OK";
}
