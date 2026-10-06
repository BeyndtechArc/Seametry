import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { prepareStrike } from "@/lib/alloys/strike-prepare";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "@/lib/hall/constants";
import { demoFunder } from "@/lib/hall/env";
import { standInIssuer } from "@/lib/hall/issuer";
import { WindowThrottle, clientAddress } from "@/lib/hall/limits";
import { Refusal } from "@/lib/refusal";

/**
 * Strike preparations allowed per client address per hour. Each mints
 * stand-ins and may top the wallet up, paid by the funder, and the route is
 * public; ten covers a holder trying it a few times, not a script.
 */
const STRIKES_PER_HOUR = 10;
const throttle = new WindowThrottle(STRIKES_PER_HOUR, 60 * 60 * 1000);

function refuse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function key(name: string, value: unknown) {
  try {
    return new PublicKey(typeof value === "string" ? value : "");
  } catch {
    throw new Refusal(400, `${name} must be a Solana public key, received ${JSON.stringify(value ?? null)}.`);
  }
}

/**
 * Prepares a Strike on a register Alloy: puts in the striker's wallet the
 * devnet stand-ins that `shares` share atoms take, and SOL to sign with. The
 * striker's own wallet then signs create in the browser; nothing here signs
 * for the striker.
 */
export async function POST(request: NextRequest) {
  let body: { alloy?: unknown; striker?: unknown; shares?: unknown };
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body with alloy, striker and shares.");
  }
  try {
    const alloy = key("alloy", body.alloy);
    const striker = key("striker", body.striker);
    if (typeof body.shares !== "string" || !/^[1-9]\d*$/.test(body.shares)) {
      return refuse(`shares must be a whole number of share atoms above zero, as a string, received ${JSON.stringify(body.shares ?? null)}.`);
    }
    const waitMs = throttle.retryAfter(clientAddress(request.headers.get("x-forwarded-for")), Date.now());
    if (waitMs > 0) {
      return NextResponse.json(
        { error: `This address has prepared ${STRIKES_PER_HOUR} Strikes in the last hour, the most one address may; try again in ${Math.ceil(waitMs / 60_000)} minutes.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil(waitMs / 1000)) } },
      );
    }
    const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
    const prepared = await prepareStrike(connection, demoFunder(), standInIssuer(), REGISTER_HALL_PROGRAM_ID, alloy, striker, BigInt(body.shares));
    return NextResponse.json({ prepared });
  } catch (error) {
    if (error instanceof Refusal) return refuse(error.message, error.status);
    return refuse(error instanceof Error ? error.message : "Preparing the Strike failed.", 502);
  }
}
