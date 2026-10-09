import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { canonicalAddress, validWalletSignature, walletChallenge } from "../src/wallet-link.mjs";

test("wallet challenges bind the account, address and origin", () => {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const issued = walletChallenge("account-1", address, "https://seametry.xyz", new Date("2026-10-09T12:00:00Z"));
  const signature = nacl.sign.detached(new TextEncoder().encode(issued.message), keypair.secretKey);

  assert.match(issued.message, /Account: account-1/);
  assert.match(issued.message, /URI: https:\/\/seametry\.xyz/);
  assert.equal(canonicalAddress(address), address);
  assert.equal(validWalletSignature(issued.message, address, Buffer.from(signature).toString("base64")), true);
});
