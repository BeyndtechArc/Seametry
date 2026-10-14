import { expect, test } from "@playwright/test";
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { broadcastSender, carriesSenderTip, composeSwap, senderEndpoint, senderTipAccount, signatureFeeLamports } from "../src/lib/allocation/sender";
import bs58 from "bs58";
import nacl from "tweetnacl";

function fixture() {
  const wallet = Keypair.generate();
  const payer = Keypair.generate();
  const parts = {
    computeBudgetInstructions: [], setupInstructions: [], addressLookupTableAddresses: [],
    swapInstruction: { programId: SystemProgram.programId.toBase58(), accounts: [{ pubkey: wallet.publicKey.toBase58(), isSigner: true, isWritable: true }], data: "" },
  };
  return { wallet, payer, options: { wallet: wallet.publicKey, tipPayer: payer.publicKey, tipAccount: senderTipAccount(0), parts, lookupTables: [], blockhash: Keypair.generate().publicKey.toBase58() } };
}

test("the sponsor never signs a Jupiter instruction that can access its funds", () => {
  const { options, payer } = fixture();
  options.parts.swapInstruction.accounts.push({ pubkey: payer.publicKey.toBase58(), isSigner: false, isWritable: true });
  expect(() => composeSwap(options)).toThrow(/tip wallet/);
});

test("the sponsor cannot also be the customer's wallet", () => {
  const { options } = fixture();
  expect(() => composeSwap({ ...options, wallet: options.tipPayer })).toThrow(/tip wallet/);
});

test("having the tip accounts present is not proof of the correct tip", () => {
  const { options } = fixture();
  const message = new TransactionMessage({ payerKey: options.wallet, recentBlockhash: options.blockhash, instructions: [
    SystemProgram.transfer({ fromPubkey: options.tipPayer, toPubkey: options.tipAccount, lamports: 1 }),
  ] }).compileToV0Message();
  expect(carriesSenderTip(new VersionedTransaction(message), options.tipPayer)).toBe(false);
});

test("both signatures survive the wallet round trip and are included in the SOL requirement", () => {
  const { wallet, payer, options } = fixture();
  const prepared = composeSwap(options)!;
  prepared.sign([payer]);
  const signed = VersionedTransaction.deserialize(prepared.serialize());
  signed.sign([wallet]);
  for (let index = 0; index < 2; index += 1) {
    expect(nacl.sign.detached.verify(signed.message.serialize(), signed.signatures[index], signed.message.staticAccountKeys[index].toBytes())).toBe(true);
  }
  expect(signatureFeeLamports(signed)).toBe(10_000n);
  const rpc = new VersionedTransaction(new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: options.blockhash, instructions: [] }).compileToV0Message());
  expect(signatureFeeLamports(rpc)).toBe(5_000n);
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
  const { wallet, payer, options } = fixture();
  const transaction = composeSwap(options)!;
  transaction.sign([wallet, payer]);
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
