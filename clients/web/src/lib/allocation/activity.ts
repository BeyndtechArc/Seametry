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
};

const storageKey = "seametry:mainnet-allocation-activity:v1";
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
    encoded = `1${encoded}`;
  }
  return encoded;
}

/** A device-local index of signatures, never a settlement authority or a hallmark. */
export function readLocalTrades(wallet: string): LocalTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is LocalTrade => typeof entry === "object" && entry !== null && entry.wallet === wallet &&
      typeof entry.signature === "string" && signaturePattern.test(entry.signature) &&
      typeof entry.mint === "string" && typeof entry.symbol === "string" &&
      (entry.direction === "buy" || entry.direction === "sell") && typeof entry.inputAtoms === "string" && /^\d+$/.test(entry.inputAtoms) &&
      Number.isInteger(entry.inputScale) && typeof entry.submittedAt === "string");
  } catch {
    return [];
  }
}

export function recordLocalTrade(trade: LocalTrade): void {
  if (typeof window === "undefined") return;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    const existing: LocalTrade[] = Array.isArray(parsed) ? parsed.filter((entry): entry is LocalTrade => typeof entry?.signature === "string") : [];
    window.localStorage.setItem(storageKey, JSON.stringify([trade, ...existing.filter((entry) => entry.signature !== trade.signature)].slice(0, 100)));
  } catch {
    // Wallet holdings still come from mainnet if this browser denies local storage.
  }
}

/** Remove a signature only when the server explicitly refused before broadcast. */
export function forgetLocalTrade(signature: string): void {
  if (typeof window === "undefined") return;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(parsed)) window.localStorage.setItem(storageKey, JSON.stringify(parsed.filter((entry) => entry?.signature !== signature)));
  } catch {
    // The on-chain holding, not this browser index, is the position authority.
  }
}
