import type { SourceObservation } from "@seametry/domain";

const REGISTRY_URL = "https://docs.stork.network/resources/asset-id-registry.md";

export async function storkCoverage(underlying: string, env: NodeJS.ProcessEnv = process.env): Promise<SourceObservation> {
  const candidates = [`${underlying}USD`, `${underlying}XUSD`];
  const response = await fetch(REGISTRY_URL);
  if (!response.ok) throw new Error(`Stork registry: HTTP ${response.status}`);
  const registry = await response.text();
  const match = candidates.find((candidate) => new RegExp(`\\|\\s*${candidate}\\s*\\|`, "i").test(registry));
  return {
    source: "stork",
    state: env.STORK_API_KEY ? (match ? "configured" : "unavailable") : "blocked-by-credentials",
    observedAt: new Date().toISOString(),
    note: match
      ? `Public registry lists ${match}; a live state still requires fetching and verifying a signed value.`
      : "No exact public-registry match found; request/verify coverage before claiming support."
  };
}
