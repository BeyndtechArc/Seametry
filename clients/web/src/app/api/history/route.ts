import { NextRequest, NextResponse } from "next/server";
import { accountServiceConfigured, authOrigin } from "@/lib/auth-proxy";
import type { HistoryAnswer, WalletExecution } from "@/lib/execution/server-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function answer(body: HistoryAnswer, status = 200) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Seametry's record for the signed-in account's linked wallets. This route
 * decides nothing about who may read what: it exchanges the session cookie
 * for the account authority's short-lived token and hands that to the
 * Gateway, which reads only the wallets the token names. Signed out, or
 * with sign-in not configured, there is nothing to read and nothing is
 * asked of either service.
 */
export async function GET(request: NextRequest) {
  const gateway = process.env.SEAMETRY_API_URL?.trim();
  const cookie = request.headers.get("cookie");
  if (!accountServiceConfigured() || !gateway || !cookie) return answer({ state: "signed-out" });

  let token: string;
  try {
    const issued = await fetch(new URL("/api/auth/token", authOrigin()), { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (issued.status === 401) return answer({ state: "signed-out" });
    if (!issued.ok) return answer({ state: "unavailable", detail: `The account service answered ${issued.status} for a token.` }, 503);
    const body = (await issued.json()) as { token?: unknown };
    if (typeof body.token !== "string") return answer({ state: "signed-out" });
    token = body.token;
  } catch {
    return answer({ state: "unavailable", detail: "The account service could not be reached." }, 503);
  }

  try {
    const response = await fetch(`${gateway.replace(/\/$/, "")}/v1/me/activity`, {
      headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return answer({ state: "unavailable", detail: `Seametry's record answered ${response.status}.` }, 503);
    const body = (await response.json()) as { data: { wallets: string[]; executions: WalletExecution[] }; meta: { as_of: string } };
    return answer({ state: "recorded", wallets: body.data.wallets, executions: body.data.executions, readAt: body.meta.as_of });
  } catch {
    return answer({ state: "unavailable", detail: "Seametry's record could not be reached." }, 503);
  }
}
