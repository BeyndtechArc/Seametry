import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { canonicalAddress, validWalletSignature, walletChallenge } from "../../../server/auth/src/wallet-link.mjs";

test("wallet linking binds an account, address, origin and expiry to the signature", () => {
  const owner = Keypair.generate();
  const other = Keypair.generate();
  const address = owner.publicKey.toBase58();
  const issued = new Date("2026-10-08T20:00:00Z");
  const challenge = walletChallenge("account-A", address, "https://seametry.xyz", issued);
  const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(challenge.message), owner.secretKey)).toString("base64");

  assert.equal(canonicalAddress(address), address);
  assert.equal(canonicalAddress("not-a-wallet"), undefined);
  assert.equal(challenge.expiresAt, "2026-10-08T20:05:00.000Z");
  assert.match(challenge.message, /Account: account-A/);
  assert.match(challenge.message, /URI: https:\/\/seametry.xyz/);
  assert.equal(validWalletSignature(challenge.message, address, signature), true);
  assert.equal(validWalletSignature(challenge.message.replace("account-A", "account-B"), address, signature), false);
  assert.equal(validWalletSignature(challenge.message, other.publicKey.toBase58(), signature), false);
  assert.equal(validWalletSignature(challenge.message, address, "not-a-signature"), false);
});
