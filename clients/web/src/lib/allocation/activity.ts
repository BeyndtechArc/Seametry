export type TradeDirection = "buy" | "sell";
export type LocalTrade = {
  signature: string;
  wallet: string;
  mint: string;
  symbol: string;
  direction: TradeDirection;
  inputAtoms: string;
  inputScale: number;
  submittedAt: string;
  /** Device-local portfolio attribution. Never an on-chain ownership claim. */
  allocationId?: string;
  allocationName?: string;
  allocationTemplateId?: string;
  /** Set only after mainnet confirms the transaction. */
  settled?: boolean;
  /** Actual constituent delta observed from transaction meta for confirmed buys. */
  settledAtoms?: string;
  settledScale?: number;
};

export type TrackedAllocationLeg = {
  mint: string;
  symbol: string;
  atoms: string;
  scale: number;
};

export type TrackedAllocation = {
  id: string;
  name: string;
  templateId?: string;
  createdAt: string;
  legs: TrackedAllocationLeg[];
};

const storageKey = "seametry:mainnet-allocation-activity:v1";
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function looksLikeTrade(entry: unknown): entry is LocalTrade {
  if (typeof entry !== "object" || entry === null) return false;
  const trade = entry as Partial<LocalTrade>;
  return typeof trade.signature === "string" && signaturePattern.test(trade.signature) &&
    typeof trade.wallet === "string" && typeof trade.mint === "string" && typeof trade.symbol === "string" &&
    (trade.direction === "buy" || trade.direction === "sell") &&
    typeof trade.inputAtoms === "string" && /^\d+$/.test(trade.inputAtoms) &&
    Number.isInteger(trade.inputScale) && typeof trade.submittedAt === "string";
}

function readAll(): LocalTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(looksLikeTrade) : [];
  } catch {
    return [];
  }
}

function writeAll(trades: LocalTrade[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(trades.slice(0, 250)));
  } catch {
    // Wallet holdings remain the authority if this browser denies storage.
  }
}

/** The first Solana signature identifies a signed transaction before the send response arrives. */
export function signedSignature(bytes: Uint8Array): string {
  if (bytes.length !== 64 || bytes.every((byte) => byte === 0)) throw new Error("The wallet did not return a transaction signature.");
  let number = 0n;
  for (const byte of bytes) number = (number << 8n) + BigInt(byte);
  let encoded = "";
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)] + encoded;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }
  return encoded;
}

/** A device-local index of signatures, never a settlement authority or a hallmark. */
export function readLocalTrades(wallet: string): LocalTrade[] {
  return readAll().filter((entry) => entry.wallet === wallet);
}

export function recordLocalTrade(trade: LocalTrade): void {
  const existing = readAll();
  const prior = existing.find((entry) => entry.signature === trade.signature);
  const merged = prior ? { ...prior, ...trade } : trade;
  writeAll([merged, ...existing.filter((entry) => entry.signature !== trade.signature)]);
}

export function patchLocalTrade(wallet: string, signature: string, patch: Partial<LocalTrade>): void {
  const existing = readAll();
  writeAll(existing.map((entry) => entry.wallet === wallet && entry.signature === signature ? { ...entry, ...patch } : entry));
}

/** Remove a signature only when the server explicitly refused before broadcast. */
export function forgetLocalTrade(signature: string): void {
  writeAll(readAll().filter((entry) => entry.signature !== signature));
}

/**
 * Rebuild device-local Allocation lots from confirmed transaction attribution.
 * The caller must still cap these quantities against current on-chain wallet
 * balances before preparing a sale: transfers outside Seametry can make the
 * local attribution larger than what the wallet still holds.
 */
export function readTrackedAllocations(wallet: string): TrackedAllocation[] {
  const trades = readLocalTrades(wallet)
    .filter((trade) => trade.settled && trade.allocationId)
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const groups = new Map<string, { name: string; templateId?: string; createdAt: string; legs: Map<string, TrackedAllocationLeg> }>();

  for (const trade of trades) {
    const id = trade.allocationId!;
    let group = groups.get(id);
    if (!group) {
      group = {
        name: trade.allocationName ?? "Allocation",
        templateId: trade.allocationTemplateId,
        createdAt: trade.submittedAt,
        legs: new Map(),
      };
      groups.set(id, group);
    }
    const existing = group.legs.get(trade.mint);
    const scale = trade.direction === "buy" ? trade.settledScale : trade.inputScale;
    const atomsText = trade.direction === "buy" ? trade.settledAtoms : trade.inputAtoms;
    if (scale === undefined || !atomsText || !/^\d+$/.test(atomsText)) continue;
    const current = existing ? BigInt(existing.atoms) : 0n;
    const delta = trade.direction === "buy" ? BigInt(atomsText) : -BigInt(atomsText);
    const next = current + delta;
    group.legs.set(trade.mint, {
      mint: trade.mint,
      symbol: trade.symbol,
      atoms: (next > 0n ? next : 0n).toString(),
      scale,
    });
  }

  return [...groups].map(([id, group]) => ({
    id,
    name: group.name,
    templateId: group.templateId,
    createdAt: group.createdAt,
    legs: [...group.legs.values()].filter((leg) => BigInt(leg.atoms) > 0n),
  })).filter((group) => group.legs.length > 0).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
