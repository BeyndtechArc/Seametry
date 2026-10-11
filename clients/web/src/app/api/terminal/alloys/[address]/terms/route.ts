import { NextResponse } from "next/server";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type { CostRow, Envelope } from "@/lib/terminal-contract";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  const { searchParams } = new URL(request.url);
  const side = searchParams.get("side");
  const shares = searchParams.get("shares");
  if ((side !== "strike" && side !== "melt") || !shares || !/^[1-9]\d*$/.test(shares) || BigInt(shares) > 18_446_744_073_709_551_615n) {
    return NextResponse.json(
      { title: "Alloy terms unavailable", detail: "Choose Strike or Melt and enter positive integer share atoms within the Hall limit.", status: 400 },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const path = side === "strike" ? "strike-cost" : "melt-proceeds";
  try {
    const terms = await readTerminalApi<Envelope<CostRow>>(`v1/alloys/${encodeURIComponent(address)}/${path}?shares=${shares}`);
    return NextResponse.json(terms, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = terminalProblem(error);
    return NextResponse.json(problem, { status: problem.status, headers: { "Cache-Control": "no-store" } });
  }
}
