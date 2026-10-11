/**
 * Measured tokenized-equity acquisition routes, not an oracle, an equity
 * reference price, a settlement receipt or a guarantee that a swap will land.
 *
 * One observation is a Jupiter USDC exact-in quote for a fixed size, with
 * raw token atoms and the mint's recorded decimal scale. No holder address is
 * read, and the Hall is not involved.
 */
export type RouteObservation = {
  schema: "seametry-route-observation-v1";
  mint: string;
  symbol: string;
  sampledAt: string;
  utcDay: string;
  inputUsdcAtoms: string;
  outputTokenAtoms: string;
  decimals: number;
  contextSlot: number;
  route: string[];
  issuer: string;
  admissionDigest: string;
};

export type RouteIndexPoint = { time: number; close: number };

export const ROUTE_SAMPLE_USDC_ATOMS = 25_000_000n;
export const ROUTE_HISTORY_DAYS = 90;

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Normalizes constituent acquisition quotes to a base of 100 using the
 * first date every leg shares. Each baseline constituent receives an equal
 * dollar allocation; its initial raw-token units are held constant in the
 * mathematical comparison. No subsequent rebalancing is assumed.
 *
 * With a fixed USDC input, token acquisition-unit price changes as
 * outputAtoms(base) / outputAtoms(day). This also reflects route friction:
 * the result is not a traditional stock-price index or a return the user earned.
 *
 * Missing dates are excluded, never filled forward or approximated by other
 * constituents. A curve is not published until >=2 complete observations.
 */
export function acquisitionQuoteIndex(
  mints: string[],
  histories: Record<string, RouteObservation[]>,
  now = Date.now(),
  days = 30,
): RouteIndexPoint[] {
  if (mints.length === 0 || new Set(mints).size !== mints.length) return [];
  const earliest = now - days * 86_400_000;
  const maps = mints.map((mint) => {
    const observations = histories[mint] ?? [];
    const byDay = new Map<string, RouteObservation>();
    for (const observation of observations) {
      if (
        observation.schema !== "seametry-route-observation-v1" ||
        observation.mint !== mint ||
        observation.inputUsdcAtoms !== ROUTE_SAMPLE_USDC_ATOMS.toString() ||
        !/^\d+$/.test(observation.outputTokenAtoms) ||
        BigInt(observation.outputTokenAtoms) <= 0n ||
        !Number.isInteger(observation.decimals) ||
        observation.decimals < 0 || observation.decimals > 18
      ) continue;
      const time = Date.parse(observation.sampledAt);
      if (!Number.isFinite(time) || time < earliest || time > now + 60_000) continue;
      if (utcDay(new Date(time)) !== observation.utcDay) continue;
      const earlier = byDay.get(observation.utcDay);
      if (!earlier || earlier.sampledAt < observation.sampledAt) byDay.set(observation.utcDay, observation);
    }
    return byDay;
  });

  const common = [...maps[0].keys()].filter((day) => maps.every((map) => map.has(day))).sort();
  if (common.length < 2) return [];

  const baseline = maps.map((map) => BigInt(map.get(common[0])!.outputTokenAtoms));
  return common.map((day) => {
    const level = maps.reduce((sum, map, index) => {
      const quantity = BigInt(map.get(day)!.outputTokenAtoms);
      return sum + Number(baseline[index]) / Number(quantity);
    }, 0) * 100 / maps.length;
    return {
      time: Math.floor(Date.parse(day + "T00:00:00.000Z") / 1000),
      close: Number(level.toFixed(6)),
    };
  }).filter((point) => Number.isFinite(point.close) && point.close > 0);
}
