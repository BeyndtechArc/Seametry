import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { demoFunder } from "@/lib/hall/env";
import { deriveIssuer } from "@/lib/hall/issuer";
import { thawLeg } from "@/lib/hall/issuer-actions";
import { DEVNET_RPC_ENDPOINT } from "@/lib/hall/constants";

/** The issuer releases the Hall's account it had frozen. HALL.md section 4.6. */
export async function POST(request: NextRequest) {
  let body: { allocId?: string; alloy?: string; mint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  if (!body.allocId || !body.alloy || !body.mint) {
    return NextResponse.json({ error: "missing allocId, alloy or mint" }, { status: 400 });
  }

  try {
    const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
    const funder = demoFunder();
    const issuer = deriveIssuer(BigInt(body.allocId));
    const signature = await thawLeg(connection, funder, issuer, new PublicKey(body.alloy), new PublicKey(body.mint));
    return NextResponse.json({ signature });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "thaw failed" },
      { status: 500 }
    );
  }
}
