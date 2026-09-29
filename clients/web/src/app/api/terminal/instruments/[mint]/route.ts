import { NextResponse } from "next/server";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type {
  Decision,
  DepthCurve,
  Envelope,
  Instrument,
  InstrumentAssayResponse,
} from "@/lib/terminal-contract";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ mint: string }> }) {
  const { mint } = await context.params;
  const encodedMint = encodeURIComponent(mint);
  try {
    const [instrument, admissibility, depth] = await Promise.all([
      readTerminalApi<Envelope<Instrument>>(`v1/instruments/${encodedMint}`),
      readTerminalApi<Envelope<Decision>>(`v1/instruments/${encodedMint}/admissibility`),
      readTerminalApi<Envelope<DepthCurve>>(`v1/instruments/${encodedMint}/depth?direction=buy`),
    ]);
    const response: InstrumentAssayResponse = { instrument, admissibility, depth };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = terminalProblem(error);
    return NextResponse.json(problem, { status: problem.status, headers: { "Cache-Control": "no-store" } });
  }
}
