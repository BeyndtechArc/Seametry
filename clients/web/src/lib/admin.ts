import "server-only";

import type { components } from "@seametry/api-types";
import { exchangeAccountToken } from "@/lib/auth-proxy";

// The Admin's reads (docs/prd/ADMIN.md), made on the server with the
// visitor's account token. Who is an admin is the Gateway's decision alone:
// this module never reads an allowlist, and treats every answer that is not
// an admitted overview as "no such page", so a signed-out visitor, a
// non-admin and an outage before admission all see the site's plain 404.

export type AdminOverview = components["schemas"]["AdminOverview"];
export type AdminSources = components["schemas"]["AdminSources"];
export type AdminWallets = components["schemas"]["AdminWallets"];
export type AdminActivity = components["schemas"]["AdminActivity"];
export type AdminEmailOptIns = components["schemas"]["AdminEmailOptIns"];
type Meta = components["schemas"]["Meta"];

export type Section<T> = { state: "read"; data: T; readAt: string } | { state: "unavailable"; detail: string };

/** wallets is the wallet list's cursor, opaque and the Gateway's to check. */
export type AdminQuery = { from?: string; to?: string; deployment?: string; wallets?: string };

export type AdminRead = {
  query: AdminQuery;
  /** Set when the Gateway refused the range asked for, and the default period was read instead. */
  refusedRange?: string;
  overview: AdminOverview;
  readAt: string;
  sources: Section<AdminSources>;
  wallets: Section<AdminWallets>;
  activity: Section<AdminActivity>;
  optIns: Section<AdminEmailOptIns>;
};

const day = /^\d{4}-\d{2}-\d{2}$/;
const deployments = new Set(["production", "preview", "development"]);

/** The date range form's values as the Gateway's parameters: whole UTC days, to inclusive. */
export function adminParameters(query: AdminQuery): URLSearchParams {
  const parameters = new URLSearchParams();
  if (query.from && day.test(query.from)) parameters.set("from", `${query.from}T00:00:00Z`);
  if (query.to && day.test(query.to)) {
    const end = new Date(`${query.to}T00:00:00Z`);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCDate(end.getUTCDate() + 1);
      parameters.set("to", end.toISOString().replace(".000Z", "Z"));
    }
  }
  if (query.deployment && deployments.has(query.deployment)) parameters.set("deployment", query.deployment);
  return parameters;
}

async function read(gateway: string, token: string, path: string, parameters: URLSearchParams): Promise<Response | string> {
  try {
    const search = parameters.toString();
    return await fetch(`${gateway}/v1/admin/${path}${search ? `?${search}` : ""}`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return `The Gateway could not be reached for ${path}.`;
  }
}

async function section<T>(gateway: string, token: string, path: string, parameters: URLSearchParams): Promise<Section<T>> {
  const response = await read(gateway, token, path, parameters);
  if (typeof response === "string") return { state: "unavailable", detail: response };
  if (!response.ok) return { state: "unavailable", detail: `The Gateway answered ${response.status} for ${path}.` };
  const body = (await response.json()) as { data: T; meta: Meta };
  return { state: "read", data: body.data, readAt: body.meta.as_of };
}

/**
 * Everything the Admin page shows, or undefined when the page must not
 * exist for this request. The session cookie is exchanged for a token here
 * and the token goes only to the Gateway.
 */
export async function readAdmin(cookie: string | null, query: AdminQuery): Promise<AdminRead | undefined> {
  const gateway = process.env.SEAMETRY_API_URL?.trim().replace(/\/$/, "");
  if (!gateway || !cookie) return undefined;
  const issued = await exchangeAccountToken(cookie);
  if (!("token" in issued)) return undefined;
  let parameters = adminParameters(query);
  let admitted = await read(gateway, issued.token, "overview", parameters);
  let refusedRange: string | undefined;
  // The Gateway's gate answers before its handlers, so a 400 means this
  // account was admitted and only the range was refused.
  if (typeof admitted !== "string" && admitted.status === 400) {
    const problem = (await admitted.json().catch(() => ({}))) as { detail?: unknown };
    refusedRange = typeof problem.detail === "string" ? problem.detail : "The Gateway refused the range.";
    parameters = adminParameters({ deployment: query.deployment });
    admitted = await read(gateway, issued.token, "overview", parameters);
  }
  if (typeof admitted === "string" || admitted.status !== 200) return undefined;
  const overview = (await admitted.json()) as { data: AdminOverview; meta: Meta };
  // The wallet list is all time, so it takes the deployment and its own
  // cursor and never the period.
  const deployment = new URLSearchParams();
  if (parameters.has("deployment")) deployment.set("deployment", parameters.get("deployment")!);
  const walletPage = new URLSearchParams(deployment);
  if (query.wallets) walletPage.set("cursor", query.wallets);
  const [sources, wallets, activity, optIns] = await Promise.all([
    section<AdminSources>(gateway, issued.token, "sources", parameters),
    section<AdminWallets>(gateway, issued.token, "wallets", walletPage),
    section<AdminActivity>(gateway, issued.token, "activity", parameters),
    section<AdminEmailOptIns>(gateway, issued.token, "email-optins", parameters),
  ]);
  return { query, refusedRange, overview: overview.data, readAt: overview.meta.as_of, sources, wallets, activity, optIns };
}

/** The page's own address with the wallet list at cursor, or at its newest page when cursor is undefined. */
export function walletPageHref(query: AdminQuery, cursor?: string): string {
  const search = new URLSearchParams();
  for (const key of ["from", "to", "deployment"] as const) if (query[key]) search.set(key, query[key]!);
  if (cursor) search.set("wallets", cursor);
  const rendered = search.toString();
  return `/admin${rendered ? `?${rendered}` : ""}#wallets`;
}
