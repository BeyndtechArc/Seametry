import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";
import { canonicalAddress } from "../src/wallet-link.mjs";

test("a wallet address is read in its canonical base58 form", () => {
  const address = Keypair.generate().publicKey.toBase58();
  assert.equal(canonicalAddress(address), address);
  assert.equal(canonicalAddress("not a key"), undefined);
  assert.equal(canonicalAddress(42), undefined);
});
