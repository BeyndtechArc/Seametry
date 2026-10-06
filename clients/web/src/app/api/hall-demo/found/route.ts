import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { demoFunder } from "@/lib/hall/env";
import { deriveIssuer } from "@/lib/hall/issuer";
import { foundAlloyFor } from "@/lib/hall/found";
import { DEVNET_RPC_ENDPOINT } from "@/lib/hall/constants";
import { FOUNDINGS_PER_WINDOW, WindowThrottle, clientAddress } from "@/lib/hall/limits";

const throttle = new WindowThrottle();

/**
 * Founds a fresh demo alloy and funds the requesting wallet with mock stock.
 * Never touches the holder's own signing: the funder and the derived mock
 * issuer sign everything here, the holder signs nothing until Strike.
 */
export async function POST(request: NextRequest) {
  let body: { holder?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body with a holder field" }, { status: 400 });
  }
  if (!body.holder) {
    return NextResponse.json({ error: "missing holder (the connected wallet's pubkey)" }, { status: 400 });
  }

  let holder: PublicKey;
  try {
    holder = new PublicKey(body.holder);
  } catch {
    return NextResponse.json({ error: "holder is not a valid public key" }, { status: 400 });
  }

  // Counted only once a request is valid, so a malformed one, which spends
  // nothing, does not use up a visitor's allowance.
  const waitMs = throttle.retryAfter(clientAddress(request.headers.get("x-forwarded-for")), Date.now());
  if (waitMs > 0) {
    const waitMinutes = Math.ceil(waitMs / 60_000);
    return NextResponse.json(
      {
        error: `this address has founded ${FOUNDINGS_PER_WINDOW} demo alloys in the last hour, the most one address may; try again in ${waitMinutes} minutes, or keep using the alloy already founded on this page`,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(waitMs / 1000)) } }
    );
  }

  // A fresh id per call, not client-supplied: an id the caller chose could
  // collide with another session's alloy address for the same sponsor.
  const allocId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

  try {
    const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
    const funder = demoFunder();
    const issuer = deriveIssuer(allocId);
    const founded = await foundAlloyFor(connection, funder, issuer, allocId, holder);
    return NextResponse.json(founded);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "founding failed" },
      { status: 500 }
    );
  }
}
