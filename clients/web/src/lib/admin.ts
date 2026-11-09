import "server-only";

import { cache } from "react";
import type { components } from "@seametry/api-types";
import { exchangeAccountToken } from "@/lib/auth-proxy";

// The Admin's reads (docs/prd/ADMIN.md), made on the server with the
// visitor's account token. Who is an admin is the Gateway's decision alone:
// this module never reads an allowlist, and treats every answer that is not
// an admitted session as "no such page", so a non-admin and an outage before
// admission both see the site's plain 404.

export type AdminSession = components["schemas"]["AdminSession"];
export type AdminOverview = components["schemas"]["AdminOverview"];
export type AdminSources = components["schemas"]["AdminSources"];
export type AdminWallets = components["schemas"]["AdminWallets"];
export type AdminActivity = components["schemas"]["AdminActivity"];
export type AdminEmailOptIns = components["schemas"]["AdminEmailOptIns"];
export type AdminPeople = components["schemas"]["AdminPeople"];
export type AdminPerson = components["schemas"]["AdminPerson"];
export type AdminSystem = components["schemas"]["AdminSystem"];
type Meta = components["schemas"]["Meta"];

export type Section<T> = { state: "read"; data: T; readAt: string } | { state: "unavailable"; detail: string };

/** wallets is the wallet list's cursor, opaque and the Gateway's to check. */
export type AdminQuery = { from?: string; to?: string; deployment?: string; wallets?: string };

export type AdminAccess =
  | { state: "admitted"; session: AdminSession; token: string; gateway: string }
  | { state: "signed-out" }
  | { state: "refused" };

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

/** A page's search parameters as an AdminQuery, keeping only single values. */
export function adminQuery(raw: Record<string, string | string[] | undefined>): AdminQuery {
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  return { from: one(raw.from), to: one(raw.to), deployment: one(raw.deployment), wallets: one(raw.wallets) };
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

/**
 * Whether this request may see the Admin, asked once per request: the layout
 * and the page both call it, and React's request cache makes that one token
 * exchange and one Gateway read. The session cookie is exchanged for a token
 * here and the token goes only to the Gateway.
 */
export const adminAccess = cache(async (cookie: string | null): Promise<AdminAccess> => {
  const gateway = process.env.SEAMETRY_API_URL?.trim().replace(/\/$/, "");
  if (!gateway) return { state: "refused" };
  if (!cookie) return { state: "signed-out" };
  const issued = await exchangeAccountToken(cookie);
  if ("signedOut" in issued) return { state: "signed-out" };
  if (!("token" in issued)) return { state: "refused" };
  const answered = await read(gateway, issued.token, "session", new URLSearchParams());
  if (typeof answered === "string" || answered.status !== 200) return { state: "refused" };
  const body = (await answered.json()) as { data: AdminSession };
  return { state: "admitted", session: body.data, token: issued.token, gateway };
});

type Admitted = Extract<AdminAccess, { state: "admitted" }>;

/** One admin read as a section: the data, or a sentence naming why it is absent. */
export async function adminSection<T>(access: Admitted, path: string, parameters: URLSearchParams): Promise<Section<T>> {
  return sectionOf<T>(await read(access.gateway, access.token, path, parameters), path);
}

export type PeriodRead<T> = { query: AdminQuery; parameters: URLSearchParams; refusedRange?: string; section: Section<T> };

/**
 * A period read. The Gateway's gate answers before its handlers, so a 400
 * means only the range was refused: the default period is read instead, and
 * the refusal is kept to be said.
 */
export async function adminPeriodRead<T>(access: Admitted, path: string, query: AdminQuery): Promise<PeriodRead<T>> {
  const parameters = adminParameters(query);
  const response = await read(access.gateway, access.token, path, parameters);
  if (typeof response === "string" || response.status !== 400) {
    return { query, parameters, section: await sectionOf<T>(response, path) };
  }
  const problem = (await response.json().catch(() => ({}))) as { detail?: unknown };
  const refusedRange = typeof problem.detail === "string" ? problem.detail : "The Gateway refused the range.";
  const fallback = adminParameters({ deployment: query.deployment });
  return { query: {}, parameters: fallback, refusedRange, section: await adminSection<T>(access, path, fallback) };
}

async function sectionOf<T>(response: Response | string, path: string): Promise<Section<T>> {
  if (typeof response === "string") return { state: "unavailable", detail: response };
  if (!response.ok) return { state: "unavailable", detail: `The Gateway answered ${response.status} for ${path}.` };
  const body = (await response.json()) as { data: T; meta: Meta };
  return { state: "read", data: body.data, readAt: body.meta.as_of };
}

/** The wallet list's address with the list at cursor, or at its newest page when cursor is undefined. */
export function walletPageHref(query: AdminQuery, cursor?: string): string {
  const search = new URLSearchParams();
  if (query.deployment) search.set("deployment", query.deployment);
  if (cursor) search.set("wallets", cursor);
  const rendered = search.toString();
  return `/admin/wallets${rendered ? `?${rendered}` : ""}`;
}
