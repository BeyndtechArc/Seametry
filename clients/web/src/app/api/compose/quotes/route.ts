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
  // hide the others' prices. They are asked one after another, and lib/jupiter
  // paces every call, because the free plan allows one request a second.
  const quotes = [];
  for (const mint of mints) {
    // A selection the page has since replaced cancels its request; asking
    // Jupiter for the rest of it would spend the shared limit on nobody.
    if (request.signal.aborted) return new NextResponse(null, { status: 499 });
    quotes.push(await quoteOf(apiKey, mint));
  }
  // The response is as old as its oldest quote, so a cached answer is never
  // presented as fresher than it is.
  const observedAt = quotes.map((quote) => quote.observedAt).sort()[0];
  return NextResponse.json({ source: "Jupiter quote, mainnet", observedAt, quotes });
}

// A draft's selection changes one box at a time, and each change asks for the
// whole selection again; without this, every tick re-quoted every stock
// already chosen. An answer about the market (a quote, or no route) is kept
// briefly; a refusal about our own rate limit is never kept, since it says
// nothing about the market and the next ask may succeed.
const QUOTE_LIFETIME_MS = 20_000;
type Answer = { mint: string; observedAt: string } & ({ inAtoms: string; outAtoms: string; slot: number; venues: string[] } | { problem: string });
const recent = new Map<string, { at: number; answer: Answer }>();

async function quoteOf(apiKey: string, mint: string): Promise<Answer> {
  const kept = recent.get(mint);
  if (kept && Date.now() - kept.at < QUOTE_LIFETIME_MS) return kept.answer;

  const query = new URLSearchParams({ inputMint: USDC_MINT, outputMint: mint, amount: REFERENCE_USDC_ATOMS.toString(), slippageBps: String(SLIPPAGE_BPS) });
  const at = Date.now();
  const observedAt = new Date(at).toISOString();
  try {
    const quote = await jupiter<JupiterQuote>(apiKey, `/quote?${query}`);
    const answer: Answer = {
      mint,
      observedAt,
      inAtoms: quote.inAmount,
      outAtoms: quote.outAmount,
      slot: quote.contextSlot,
      venues: [...new Set(quote.routePlan.map((step) => step.swapInfo.label))],
    };
    recent.set(mint, { at, answer });
    return answer;
  } catch (error) {
    const answer: Answer = { mint, observedAt, problem: problemOf(error) };
    if (error instanceof JupiterRefusal && error.code === "NO_ROUTES_FOUND") recent.set(mint, { at, answer });
    return answer;
  }
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
