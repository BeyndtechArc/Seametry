import { NextRequest, NextResponse } from "next/server";
import { admissions } from "@/lib/allocation/admissions";
import { SLIPPAGE_BPS, USDC_MINT } from "@/lib/allocation/rules";
import { quoteKey } from "@/lib/compose/quote-config";
import { JupiterRefusal, jupiter, type JupiterQuote } from "@/lib/jupiter";

// Every constituent is priced by the same reference purchase, so their
// quotes compare like for like: what 100 USDC buys on mainnet right now.
const REFERENCE_USDC_ATOMS = 100_000_000n;

/** Live mainnet quotes for the constituents of a draft Formula. Read only; nothing is signed or sent. */
export async function GET(request: NextRequest) {
  const mints = (request.nextUrl.searchParams.get("mints") ?? "").split(",").filter(Boolean);
  if (mints.length === 0 || mints.length > 12) {
    return NextResponse.json({ error: `Expected ?mints= 1 to 12 comma-separated mints, received ${mints.length}.` }, { status: 400 });
  }
  const captured = new Set(admissions.instruments.map((admission) => admission.instrument.mint));
  const unknown = mints.find((mint) => !captured.has(mint));
  if (unknown) {
    return NextResponse.json({ error: `${unknown} is not a captured instrument, so it cannot enter a Formula draft.` }, { status: 400 });
  }
  const key = quoteKey();
  if ("problem" in key) {
    return NextResponse.json({ error: key.problem }, { status: 503 });
  }
  const { apiKey } = key;

  // Each constituent answers for itself: on 4 October 2026 three of the seven
  // captured instruments had no mainnet route, and one missing route must not
  // hide the others' prices. They are asked one after another, because the
  // free Jupiter plan allows one request a second and a burst of parallel
  // quotes came back as 429s that read like missing markets.
  const quotes = [];
  for (const mint of mints) {
    const query = new URLSearchParams({ inputMint: USDC_MINT, outputMint: mint, amount: REFERENCE_USDC_ATOMS.toString(), slippageBps: String(SLIPPAGE_BPS) });
    try {
      const quote = await jupiter<JupiterQuote>(apiKey, `/quote?${query}`);
      quotes.push({
        mint,
        inAtoms: quote.inAmount,
        outAtoms: quote.outAmount,
        slot: quote.contextSlot,
        venues: [...new Set(quote.routePlan.map((step) => step.swapInfo.label))],
      });
    } catch (error) {
      quotes.push({ mint, problem: problemOf(error) });
    }
  }
  return NextResponse.json({ source: "Jupiter quote, mainnet", observedAt: new Date().toISOString(), quotes });
}

function problemOf(error: unknown): string {
  if (error instanceof JupiterRefusal && error.upstream === 429) {
    return "Jupiter is limiting how often this deployment may ask (HTTP 429). This says nothing about the market; read the quotes again in a moment.";
  }
  if (error instanceof JupiterRefusal && error.code === "NO_ROUTES_FOUND") {
    return "No mainnet route buys it with USDC right now.";
  }
  return error instanceof Error ? error.message : "Quoting failed.";
}
