import { NextRequest, NextResponse } from "next/server";
import { balanceEndpoint, readBalances } from "@/lib/wallet/balances";

/** What a connected wallet holds on the network the current page acts on. */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  const network = request.nextUrl.searchParams.get("network");
  if (!owner || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(owner)) {
    return NextResponse.json({ error: "Expected ?owner= a base58 wallet address." }, { status: 400 });
  }
  if (network !== "mainnet" && network !== "devnet") {
    return NextResponse.json({ error: `Expected ?network= mainnet or devnet, received ${network ?? "nothing"}.` }, { status: 400 });
  }
  const configured = balanceEndpoint(network);
  if ("missing" in configured) {
    return NextResponse.json({ error: `This deployment cannot read mainnet balances: ${configured.missing} is not set.` }, { status: 503 });
  }
  try {
    return NextResponse.json(await readBalances(network, configured.endpoint, owner));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reading the balances failed." }, { status: 502 });
  }
}
