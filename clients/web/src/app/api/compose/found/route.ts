import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { admissions, isAdmitted } from "@/lib/allocation/admissions";
import { identityProblem } from "@/lib/compose/formula";
import { prepareFounding, type FoundingLeg } from "@/lib/compose/founding-prepare";
import { registeredMetadataUri } from "@/lib/compose/identity";
import { DEVNET_RPC_ENDPOINT, MAX_CONSTITUENTS, REGISTER_HALL_PROGRAM_ID } from "@/lib/hall/constants";
import { demoFunder } from "@/lib/hall/env";
import { standInIssuer } from "@/lib/hall/issuer";
import { FOUNDINGS_PER_WINDOW, WindowThrottle, clientAddress } from "@/lib/hall/limits";
import { Refusal } from "@/lib/refusal";

const throttle = new WindowThrottle();
const U64_MAX = 2n ** 64n - 1n;

type Body = { sponsor?: string; name?: string; symbol?: string; legs?: { mint?: string; atomsPerShare?: string }[] };

function refuse(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/**
 * Prepares a founding on the register's devnet Hall: stand-ins for the
 * Formula's real constituents, the sponsor's genesis deposits, rent for the
 * sponsor, and the lookup table its transaction compiles against. The
 * sponsor's own wallet then signs initialize_alloy in the browser; nothing
 * here signs for the sponsor. The share's metadata URI is unique to its
 * on-chain Alloy address, rather than requiring a static file per name.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected a JSON body with sponsor, name, symbol and legs.");
  }

  let sponsor: PublicKey;
  try {
    sponsor = new PublicKey(body.sponsor ?? "");
  } catch {
    return refuse(`sponsor must be the connected wallet's public key, received ${JSON.stringify(body.sponsor ?? null)}.`);
  }
  const name = body.name?.trim() ?? "";
  const symbol = body.symbol ?? "";
  const identity = identityProblem(name, symbol);
  if (identity) return refuse(identity);

  const requested = body.legs ?? [];
  if (requested.length === 0 || requested.length > MAX_CONSTITUENTS) {
    return refuse(`A Formula holds 1 to ${MAX_CONSTITUENTS} constituents; this one has ${requested.length}.`);
  }
  if (new Set(requested.map((leg) => leg.mint)).size !== requested.length) {
    return refuse("A constituent appears more than once in this Formula.");
  }
  const legs: FoundingLeg[] = [];
  for (const leg of requested) {
    const admission = admissions.instruments.find((candidate) => candidate.instrument.mint === leg.mint);
    if (!admission || !isAdmitted(admission)) {
      return refuse(`${leg.mint ?? "A constituent"} is not admitted by the policy engine, so it cannot enter a founded Formula.`);
    }
    const atoms = /^[1-9]\d*$/.test(leg.atomsPerShare ?? "") ? BigInt(leg.atomsPerShare!) : 0n;
    if (atoms === 0n || atoms > U64_MAX) {
      return refuse(`${admission.instrument.symbol} needs a whole number of atoms per share above zero, received ${JSON.stringify(leg.atomsPerShare ?? null)}.`);
    }
    legs.push({ symbol: admission.instrument.symbol ?? admission.instrument.mint, realMint: admission.instrument.mint, decimals: admission.decimals, atomsPerShare: atoms });
  }

  const waitMs = throttle.retryAfter(clientAddress(request.headers.get("x-forwarded-for")), Date.now());
  if (waitMs > 0) {
    return NextResponse.json(
      { error: `This address has prepared ${FOUNDINGS_PER_WINDOW} foundings in the last hour, the most one address may; try again in ${Math.ceil(waitMs / 60_000)} minutes.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(waitMs / 1000)) } },
    );
  }

  try {
    const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
    const prepared = await prepareFounding(connection, demoFunder(), standInIssuer(), REGISTER_HALL_PROGRAM_ID, sponsor, legs);
    return NextResponse.json({ prepared, identity: { name, symbol, uri: registeredMetadataUri(prepared.alloy) } });
  } catch (error) {
    if (error instanceof Refusal) return refuse(error.message, error.status);
    return refuse(error instanceof Error ? error.message : "Preparing the founding failed.", 502);
  }
}
