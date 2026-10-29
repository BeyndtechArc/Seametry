import { PublicKey } from "@solana/web3.js";

export function canonicalAddress(input) {
  if (typeof input !== "string" || input.length > 44) return undefined;
  try {
    return new PublicKey(input).toBase58();
  } catch {
    return undefined;
  }
}
