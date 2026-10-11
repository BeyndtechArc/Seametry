import "server-only";

const HISTORY_ROOT = "https://pyth.dourolabs.app/v1";
const CHANNEL = "fixed_rate@1000ms";

type SearchRow = {
  symbol?: string;
  ticker?: string;
  full_name?: string;
  description?: string;
  type?: string;
};

type HistoryResponse = {
  s?: string;
  t?: number[];
  c?: number[];
};

export type ReferencePoint = { time: number; close: number };

function accessToken(): string {
  const token = process.env.PYTH_PRO_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("PYTH_PRO_ACCESS_TOKEN is not configured.");
  return token;
}

function rowsFrom(value: unknown): SearchRow[] {
  if (Array.isArray(value)) return value.filter((row): row is SearchRow => typeof row === "object" && row !== null);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["data", "symbols", "result"]) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((row): row is SearchRow => typeof row === "object" && row !== null);
  }
  return [];
}

async function resolveEquitySymbol(ticker: string): Promise<string> {
  const url = new URL(HISTORY_ROOT + "/" + CHANNEL + "/search");
  url.searchParams.set("query", ticker);
  url.searchParams.set("type", "equity");
  url.searchParams.set("exchange", "PYTH");
  url.searchParams.set("limit", "15");
  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error("Pyth symbol lookup returned " + response.status + " for " + ticker + ".");
  const rows = rowsFrom(await response.json());
  const upper = ticker.toUpperCase();
  const score = (row: SearchRow) => {
    const values = [row.symbol, row.ticker, row.full_name].filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase());
    if (values.some((value) => value === upper || value === upper + "/USD")) return 3;
    if (values.some((value) => value.endsWith("." + upper + "/USD") || value.endsWith(":" + upper))) return 2;
    if (values.some((value) => value.includes(upper))) return 1;
    return 0;
  };
  const match = [...rows].sort((a, b) => score(b) - score(a))[0];
  if (!match || score(match) === 0) throw new Error("Pyth exposes no unambiguous equity symbol for " + ticker + ".");
  const symbol = match.symbol ?? match.ticker ?? match.full_name;
  if (!symbol) throw new Error("Pyth exposes no usable equity symbol for " + ticker + ".");
  return symbol;
}

export async function equityDailyHistory(ticker: string, days = 45): Promise<ReferencePoint[]> {
  const symbol = await resolveEquitySymbol(ticker);
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86_400;
  const url = new URL(HISTORY_ROOT + "/" + CHANNEL + "/history");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("resolution", "D");
  const response = await fetch(url, {
    headers: { authorization: "Bearer " + accessToken() },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error("Pyth history returned " + response.status + " for " + ticker + ".");
  const body = await response.json() as HistoryResponse;
  if (body.s !== "ok" || !Array.isArray(body.t) || !Array.isArray(body.c) || body.t.length !== body.c.length) {
    throw new Error("Pyth returned no usable daily history for " + ticker + ".");
  }
  return body.t
    .map((time, index) => ({ time, close: Number(body.c![index]) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close) && point.close > 0);
}

/**
 * Price-only equal-weight reference series. Every member must have a price at
 * a timestamp or that timestamp is omitted; Seametry never publishes a partial
 * index level that looks complete.
 */
export function equalWeightReference(series: ReferencePoint[][]): ReferencePoint[] {
  if (series.length === 0 || series.some((points) => points.length === 0)) return [];
  const maps = series.map((points) => new Map(points.map((point) => [point.time, point.close])));
  const commonTimes = series[0].map((point) => point.time).filter((time) => maps.every((map) => map.has(time))).sort((a, b) => a - b);
  if (commonTimes.length === 0) return [];
  const bases = maps.map((map) => map.get(commonTimes[0])!);
  return commonTimes.map((time) => ({
    time,
    close: maps.reduce((sum, map, index) => sum + (map.get(time)! / bases[index]) * 100, 0) / maps.length,
  }));
}
