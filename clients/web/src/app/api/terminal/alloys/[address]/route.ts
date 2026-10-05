import { NextResponse } from "next/server";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type { Alloy, AlloyRecordResponse, CostRow, Envelope } from "@/lib/terminal-contract";
import { ONE_SHARE_ATOMS } from "@/lib/hall/constants";

export const dynamic = "force-dynamic";

// The record states its terms for one whole share.
const quotedShares = ONE_SHARE_ATOMS.toString();

export async function GET(_request: Request, context: { params: Promise<{ address: string }> }) {
  const { address } = await context.params;
  const encodedAddress = encodeURIComponent(address);
  try {
    const [alloy, strike, melt] = await Promise.all([
      readTerminalApi<Envelope<Alloy>>(`v1/alloys/${encodedAddress}`),
      readTerminalApi<Envelope<CostRow>>(`v1/alloys/${encodedAddress}/strike-cost?shares=${quotedShares}`),
      readTerminalApi<Envelope<CostRow>>(`v1/alloys/${encodedAddress}/melt-proceeds?shares=${quotedShares}`),
    ]);
    const response: AlloyRecordResponse = { alloy, strike, melt };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = terminalProblem(error);
    return NextResponse.json(problem, { status: problem.status, headers: { "Cache-Control": "no-store" } });
  }
}
