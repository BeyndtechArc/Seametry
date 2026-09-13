import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CandidateCoverage } from "@seametry/domain";
import { chainlinkCoverage } from "@seametry/source-chainlink";
import { fetchJupiterQuote } from "@seametry/source-jupiter";
import { storkCoverage } from "@seametry/source-stork";
import { fetchXStocksAsset } from "@seametry/source-xstocks";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const CANDIDATES = ["SPYx", "NVDAx", "AAPLx", "UNHx"];

const rows = await Promise.all(CANDIDATES.map(async (symbol): Promise<CandidateCoverage> => {
  const notes: string[] = [];
  const asset = await fetchXStocksAsset(symbol);
  const [stork, quoteResult] = await Promise.all([
    storkCoverage(asset.instrument.underlying),
    fetchJupiterQuote(USDC, asset.instrument.mint, "10000000").then((quote) => ({ quote })).catch((error: unknown) => ({ error }))
  ]);
  const chainlink = chainlinkCoverage(asset.instrument.underlying);
  notes.push(asset.observation.note ?? "Issuer state returned without a period label.");
  if (chainlink.note) notes.push(`Chainlink: ${chainlink.note}`);
  if (stork.note) notes.push(`Stork: ${stork.note}`);

  if ("error" in quoteResult) notes.push(`Jupiter: ${String(quoteResult.error)}`);
  const quote = "quote" in quoteResult ? quoteResult.quote : undefined;
  return {
    instrument: asset.instrument,
    issuer: asset.observation.state,
    jupiter: quote ? "live" : "unavailable",
    chainlink: chainlink.state,
    stork: stork.state,
    route: quote?.routeLabels.join(" → "),
    priceImpactPct: quote?.priceImpactPct,
    notes
  };
}));

const generatedAt = new Date().toISOString();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "evidence");
await mkdir(evidenceDir, { recursive: true });
await writeFile(resolve(evidenceDir, "coverage-latest.json"), `${JSON.stringify({ generatedAt, rows }, null, 2)}\n`);

const table = [
  "# Seametry coverage probe",
  "",
  `Generated: ${generatedAt}`,
  "",
  "A `blocked-by-credentials` result means coverage is unproven in this run, not unsupported.",
  "",
  "| Asset | Issuer | Jupiter | Route | Impact | Chainlink | Stork |",
  "|---|---|---|---|---:|---|---|",
  ...rows.map((row) => `| ${row.instrument.symbol} | ${row.issuer} | ${row.jupiter} | ${row.route ?? "—"} | ${row.priceImpactPct === undefined ? "—" : `${row.priceImpactPct}%`} | ${row.chainlink} | ${row.stork} |`),
  "",
  "## Notes",
  "",
  ...rows.flatMap((row) => [`### ${row.instrument.symbol}`, "", ...row.notes.map((note) => `- ${note}`), ""])
].join("\n");
await writeFile(resolve(evidenceDir, "coverage-latest.md"), `${table}\n`);
console.table(rows.map((row) => ({ asset: row.instrument.symbol, issuer: row.issuer, jupiter: row.jupiter, route: row.route, impact: row.priceImpactPct, chainlink: row.chainlink, stork: row.stork })));
console.log(`Evidence written to ${evidenceDir}`);
