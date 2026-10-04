import "server-only";
import { USDC_MINT } from "@/lib/allocation/rules";
import { DEVNET_RPC_ENDPOINT } from "@/lib/hall/constants";

export type WalletNetwork = "mainnet" | "devnet";

export type Holding = { asset: string; atoms: string; scale: number };

export type Balances = {
  network: WalletNetwork;
  source: string;
  observedAt: string;
  holdings: Holding[];
};

const LAMPORT_SCALE = 9;
const USDC_SCALE = 6;

/**
 * The RPC each network is read through. Mainnet goes through the deployment's
 * own MAINNET_RPC_URL, as the Allocation does, so the browser's
 * content-security policy keeps naming only the devnet origin.
 */
export function balanceEndpoint(network: WalletNetwork): { endpoint: string } | { missing: string } {
  if (network === "devnet") return { endpoint: DEVNET_RPC_ENDPOINT };
  const endpoint = process.env.MAINNET_RPC_URL?.trim();
  return endpoint ? { endpoint } : { missing: "MAINNET_RPC_URL" };
}

async function rpc(endpoint: string, method: string, params: unknown[]): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status} from the ${new URL(endpoint).host} RPC.`);
  return response.text();
}

// getBalance answers with lamports as a bare JSON number, which JSON.parse
// would round above 2^53 (about nine million SOL). Reading the digits from the
// text keeps every lamport exact.
async function lamports(endpoint: string, owner: string): Promise<string> {
  const text = await rpc(endpoint, "getBalance", [owner, { commitment: "confirmed" }]);
  const value = /"value"\s*:\s*(\d+)/.exec(text)?.[1];
  if (value === undefined) throw new Error(`getBalance gave no value for ${owner}: ${text.slice(0, 160)}`);
  return value;
}

// Token amounts already arrive as digit strings in jsonParsed form, and an
// owner may hold the mint in more than one account, so they are summed as
// bigint. No account at all is a reading of zero, not an absent reading.
async function tokenAtoms(endpoint: string, owner: string, mint: string): Promise<string> {
  const text = await rpc(endpoint, "getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  const body = JSON.parse(text) as { result?: { value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[] }; error?: { message: string } };
  if (!body.result) throw new Error(`getTokenAccountsByOwner failed for ${owner}: ${body.error?.message ?? "no result"}`);
  return body.result.value.reduce((sum, entry) => sum + BigInt(entry.account.data.parsed.info.tokenAmount.amount), 0n).toString();
}

export async function readBalances(network: WalletNetwork, endpoint: string, owner: string): Promise<Balances> {
  const sol = lamports(endpoint, owner);
  const holdings: Promise<Holding>[] = [sol.then((atoms) => ({ asset: "SOL", atoms, scale: LAMPORT_SCALE }))];
  if (network === "mainnet") {
    holdings.push(tokenAtoms(endpoint, owner, USDC_MINT).then((atoms) => ({ asset: "USDC", atoms, scale: USDC_SCALE })));
  }
  return {
    network,
    source: `Solana ${network} RPC`,
    observedAt: new Date().toISOString(),
    holdings: await Promise.all(holdings),
  };
}
