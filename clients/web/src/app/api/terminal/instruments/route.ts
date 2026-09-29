import { NextResponse, type NextRequest } from "next/server";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type { InstrumentRegisterResponse } from "@/lib/terminal-contract";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.search;
  try {
    const response = await readTerminalApi<InstrumentRegisterResponse>(`v1/instruments${query}`);
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem = terminalProblem(error);
    return NextResponse.json(problem, { status: problem.status, headers: { "Cache-Control": "no-store" } });
  }
}
