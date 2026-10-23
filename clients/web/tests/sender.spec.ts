import { expect, test } from "@playwright/test";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { LOADED_DATA_LIMIT_MAX_BYTES, SENDER_TIP_LAMPORTS } from "../src/lib/allocation/rules";
import { broadcastSender, carriesSenderTip, composeSwap, loadedDataLimitInstruction, loadedDataLimitOf, senderEndpoint, senderTipAccount, signatureFeeLamports, withLoadedDataLimit } from "../src/lib/allocation/sender";
import bs58 from "bs58";
import nacl from "tweetnacl";

function fixture() {
  const wallet = Keypair.generate();
  const parts = {
    computeBudgetInstructions: [], setupInstructions: [], addressLookupTableAddresses: [],
    swapInstruction: { programId: SystemProgram.programId.toBase58(), accounts: [{ pubkey: wallet.publicKey.toBase58(), isSigner: true, isWritable: true }], data: "" },
  };
  return { wallet, options: { wallet: wallet.publicKey, tipAccount: senderTipAccount(0), parts, lookupTables: [], blockhash: Keypair.generate().publicKey.toBase58() } };
}

test("a route that names any signer but the holder is never offered for signing", () => {
  const { options } = fixture();
  options.parts.swapInstruction.accounts.push({ pubkey: Keypair.generate().publicKey.toBase58(), isSigner: true, isWritable: true });
  expect(() => composeSwap(options)).toThrow(/unexpected signer/);
});

test("having the tip accounts present is not proof of the correct tip", () => {
  const { options } = fixture();
  const recognised = (fromPubkey: PublicKey, lamports: number) => carriesSenderTip(new VersionedTransaction(new TransactionMessage({ payerKey: options.wallet, recentBlockhash: options.blockhash, instructions: [
    SystemProgram.transfer({ fromPubkey, toPubkey: options.tipAccount, lamports }),
  ] }).compileToV0Message()));
  expect(recognised(options.wallet, SENDER_TIP_LAMPORTS)).toBe(true);
  expect(recognised(options.wallet, 1)).toBe(false);
  expect(recognised(Keypair.generate().publicKey, SENDER_TIP_LAMPORTS)).toBe(false);
});

test("the holder's one signature survives the wallet round trip and is the only one paid for", () => {
  const { wallet, options } = fixture();
  const signed = VersionedTransaction.deserialize(composeSwap(options)!.serialize());
  signed.sign([wallet]);
  expect(signed.signatures).toHaveLength(1);
  expect(nacl.sign.detached.verify(signed.message.serialize(), signed.signatures[0], wallet.publicKey.toBytes())).toBe(true);
  expect(signatureFeeLamports(signed)).toBe(5_000n);
});

test("a leg sets its loaded account data limit at the ceiling, once, for simulation to measure", () => {
  const { options } = fixture();
  const leg = composeSwap(options)!;
  expect(loadedDataLimitOf(leg)).toBe(LOADED_DATA_LIMIT_MAX_BYTES);

  // Jupiter's own limit is kept, never joined by a second: the runtime refuses a duplicate compute budget instruction.
  const jupiters = Buffer.from(loadedDataLimitInstruction(2_000_000).data).toString("base64");
  const withJupiters = { ...options, parts: { ...options.parts, computeBudgetInstructions: [{ programId: ComputeBudgetProgram.programId.toBase58(), accounts: [], data: jupiters }] } };
  const kept = composeSwap(withJupiters)!;
  expect(loadedDataLimitOf(kept)).toBe(2_000_000);
  const budget = kept.message.compiledInstructions.filter((ix) => kept.message.staticAccountKeys[ix.programIdIndex].equals(ComputeBudgetProgram.programId));
  expect(budget).toHaveLength(1);
});

test("tightening the limit changes those four bytes and nothing else, and never a signed leg", () => {
  const { wallet, options } = fixture();
  const leg = composeSwap(options)!;
  const tightened = withLoadedDataLimit(leg, 1_146_880);
  expect(loadedDataLimitOf(tightened)).toBe(1_146_880);
  expect(loadedDataLimitOf(leg)).toBe(LOADED_DATA_LIMIT_MAX_BYTES);
  const [a, b] = [leg.message.serialize(), tightened.message.serialize()];
  expect(b.length).toBe(a.length);
  expect(a.filter((byte, index) => byte !== b[index]).length).toBeLessThanOrEqual(4);
  expect(carriesSenderTip(tightened)).toBe(true);

  tightened.sign([wallet]);
  expect(() => withLoadedDataLimit(tightened, 2_000_000)).toThrow(/signature covers it/);
});

test("Sender configuration always selects keyed SWQOS and rejects lookalike RPC hosts", () => {
  const derived = new URL(senderEndpoint("https://mainnet.helius-rpc.com/?api-key=test%2Bkey")!);
  expect(derived.searchParams.get("api-key")).toBe("test+key");
  expect(derived.searchParams.get("swqos_only")).toBe("true");
  expect(senderEndpoint("https://evilhelius-rpc.com/?api-key=test")).toBeUndefined();
  expect(senderEndpoint("https://rpc.example.com/")).toBeUndefined();
  const overridden = new URL(senderEndpoint("https://rpc.example.com", "https://sender.helius-rpc.com/fast?api-key=test&swqos_only=false")!);
  expect(overridden.searchParams.get("swqos_only")).toBe("true");
  for (const url of ["https://sender.helius-rpc.com/fast", "https://sender.helius-rpc.com.evil.test/fast?api-key=secret", "http://sender.helius-rpc.com/fast?api-key=secret", "not-a-url-secret"]) {
    expect(() => senderEndpoint("https://rpc.example.com", url)).toThrow(/HELIUS_SENDER_URL/);
    try { senderEndpoint("https://rpc.example.com", url); } catch (error) { expect(String(error)).not.toContain("secret"); }
  }
});

function signedFixture() {
  const { wallet, options } = fixture();
  const transaction = composeSwap(options)!;
  transaction.sign([wallet]);
  return transaction;
}

test("Sender sends the exact signed bytes and accepts only that signature", async () => {
  const transaction = signedFixture();
  const signature = bs58.encode(transaction.signatures[0]);
  const request: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    expect(body).toEqual({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [Buffer.from(transaction.serialize()).toString("base64"), { encoding: "base64", skipPreflight: true, maxRetries: 0 }] });
    expect(init!.redirect).toBe("error");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    return Response.json({ jsonrpc: "2.0", id: 1, result: signature });
  };
  await expect(broadcastSender("https://sender.helius-rpc.com/fast?api-key=fixture", transaction, request)).resolves.toBe(signature);
});

for (const kind of ["empty", "invalid-json", "mismatched-signature", "wrong-id", "internal-error", "http-error", "timeout"] as const) {
  test(`Sender ${kind} remains uncertain rather than permitting a duplicate purchase`, async () => {
    const transaction = signedFixture();
    const request: typeof fetch = async () => {
      if (kind === "timeout") throw new Error("secret-endpoint-must-not-leak");
      if (kind === "invalid-json") return new Response("not json");
      if (kind === "empty") return Response.json({});
      if (kind === "internal-error") return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
      return Response.json({ jsonrpc: "2.0", id: kind === "wrong-id" ? 2 : 1, result: kind === "mismatched-signature" ? "different" : bs58.encode(transaction.signatures[0]) }, { status: kind === "http-error" ? 503 : 200 });
    };
    try {
      await broadcastSender("https://sender.helius-rpc.com/fast?api-key=fixture", transaction, request);
      throw new Error("Expected an uncertain submission.");
    } catch (error) {
      expect(error).toMatchObject({ status: 502 });
      expect((error as { detail: { notSent?: boolean } }).detail.notSent).toBeUndefined();
      expect(String(error)).not.toContain("secret-endpoint");
    }
  });
}

test("an explicit Sender parameter refusal permits preparation again", async () => {
  const request: typeof fetch = async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "invalid params" } });
  await expect(broadcastSender("https://sender.helius-rpc.com/fast?api-key=fixture", signedFixture(), request)).rejects.toMatchObject({ status: 503, detail: { notSent: true } });
});
