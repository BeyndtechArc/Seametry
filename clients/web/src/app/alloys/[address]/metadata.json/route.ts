import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { registeredMetadataUri } from "@/lib/compose/identity";
import { identityProblem } from "@/lib/compose/formula";
import { readTerminalApi, terminalProblem } from "@/lib/terminal-api";
import type { Alloy, Envelope } from "@/lib/terminal-contract";

export const dynamic = "force-dynamic";

/** Off-chain token JSON is reconstructed from the Hall, not a mutable name file. */
export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    if (new PublicKey(address).toBase58() !== address) throw new Error("Invalid Alloy address");
  } catch {
    return NextResponse.json({ error: "Alloy address not found" }, { status: 404 });
  }

  try {
    const { data: alloy } = await readTerminalApi<Envelope<Alloy>>(`v1/alloys/${address}`);
    const metadata = alloy.metadata;
    if (alloy.address !== address || alloy.cluster !== "devnet" || !metadata || metadata.uri !== registeredMetadataUri(address) || identityProblem(metadata.name, metadata.symbol)) {
      return NextResponse.json({ error: "Alloy metadata not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        name: metadata.name,
        symbol: metadata.symbol,
        description: "A fixed Formula founded on the Seametry devnet Hall. Its constituents and quantities are recorded in the Alloy account.",
      },
      { headers: { "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    const problem = terminalProblem(error);
    return NextResponse.json({ error: problem.title }, { status: problem.status, headers: { "Cache-Control": "no-store" } });
  }
}
