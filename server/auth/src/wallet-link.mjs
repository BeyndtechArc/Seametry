import { randomBytes, randomUUID } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

export function canonicalAddress(input) {
  if (typeof input !== "string" || input.length > 44) return undefined;
  try {
    return new PublicKey(input).toBase58();
  } catch {
    return undefined;
  }
}

export function walletChallenge(accountId, address, origin, now = new Date()) {
  const id = randomUUID();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);
  const nonce = randomBytes(24).toString("base64url");
  const message = [
    `${new URL(origin).host} requests a signature to link this Solana wallet to Seametry.`,
    `Address: ${address}`,
    `Account: ${accountId}`,
    `URI: ${origin}`,
    `Nonce: ${nonce}`,
    `Issued At: ${now.toISOString()}`,
    `Expiration Time: ${expires.toISOString()}`,
    "This does not approve a transaction.",
  ].join("\n");
  return { id, message, expiresAt: expires.toISOString() };
}

export function validWalletSignature(message, address, encoded) {
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{86}==?$/.test(encoded)) return false;
  const signature = Buffer.from(encoded, "base64");
  if (signature.length !== 64) return false;
  return nacl.sign.detached.verify(new TextEncoder().encode(message), signature, new PublicKey(address).toBytes());
}
