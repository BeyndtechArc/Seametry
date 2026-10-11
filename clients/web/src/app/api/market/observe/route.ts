import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sampleAdmittedRoutes } from "@/lib/market/route-sampler";
import { claimDailyObservationRun, routeHistoryConfigured, saveRouteObservations } from "@/lib/market/route-history-store";
import { utcDay } from "@/lib/market/route-observations";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function validCronAuthorization(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "", "utf8");
  const expected = Buffer.from("Bearer " + secret, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Vercel daily cron only. Never invoke Jupiter from an unauthenticated page
 * view: quote calls are rate-limited and can cost the deployment money.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "The observation scheduler is not configured." }, { status: 503 });
  if (!validCronAuthorization(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey || !routeHistoryConfigured()) {
    return NextResponse.json({ error: "Read-only route sampling is not configured." }, { status: 503 });
  }

  try {
    const day = utcDay(new Date());
    if (!(await claimDailyObservationRun(day))) {
      return NextResponse.json({ state: "already-sampled", day });
    }
    const outcome = await sampleAdmittedRoutes(apiKey);
    await saveRouteObservations(outcome.observations);
    return NextResponse.json({
      state: outcome.observations.length ? "recorded" : "no-usable-quotes",
      day,
      attempted: outcome.attempted,
      recorded: outcome.observations.length,
      refused: outcome.refused,
      sampleSizeUsdcPerMint: 25,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The observation run failed. Inspect server logs." }, { status: 503 });
  }
}
