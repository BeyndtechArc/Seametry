import { expect, test } from "@playwright/test";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import { createSignInMessageText, verifySignIn } from "@solana/wallet-standard-util";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import { signInWithSolana } from "../src/lib/solana-sign-in";

// The browser half of Sign in with Solana (src/lib/solana-sign-in.ts): the
// auth service writes the message, the wallet signs it, and each refusal the
// service can give is named for the person reading it.
const input: SolanaSignInInput = {
  domain: "seametry.xyz", statement: "Sign in to Seametry. This does not approve a transaction.", uri: "https://seametry.xyz",
  version: "1", chainId: "solana:mainnet", nonce: "a".repeat(48), issuedAt: "2026-10-29T12:00:00.000Z", expirationTime: "2026-10-29T12:05:00.000Z",
};

function service(verify: (body: { nonce: string; output: Record<string, string> }) => { status: number; body: unknown }) {
  const calls: { path: string; body: unknown }[] = [];
  const post = (async (path: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ path, body });
    const answer = path === "/api/auth/solana/nonce" ? { status: 200, body: { input } } : verify(body);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { post, calls };
}

const fromBase64 = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));

function checked(body: { output: Record<string, string> }) {
  const { address, publicKey, signedMessage, signature } = body.output;
  const valid = verifySignIn(input, { account: { address, publicKey: fromBase64(publicKey), chains: [], features: [] }, signedMessage: fromBase64(signedMessage), signature: fromBase64(signature) });
  return valid ? { status: 200, body: { user: { id: "account-1", walletAddress: address } } } : { status: 401, body: { code: "INVALID_SIGNATURE" } };
}

test("a wallet with solana:signIn signs the service's message and the session opens", async () => {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const { post, calls } = service(checked);
  const result = await signInWithSolana({
    signIn: async (given) => {
      const signedMessage = new TextEncoder().encode(createSignInMessageText({ ...given, domain: given.domain ?? "", address }));
      return { account: { address, publicKey: keypair.publicKey.toBytes(), chains: [], features: [] }, signedMessage, signature: nacl.sign.detached(signedMessage, keypair.secretKey) };
    },
  }, post);
  expect(result).toEqual({ state: "signed-in", userId: "account-1", address });
  expect(calls.map((call) => call.path)).toEqual(["/api/auth/solana/nonce", "/api/auth/solana/verify"]);
  expect((calls[1].body as { nonce: string }).nonce).toBe(input.nonce);
});

test("a wallet with only signMessage signs the same message text", async () => {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const { post } = service(checked);
  const result = await signInWithSolana({ address, publicKey: keypair.publicKey.toBytes(), signMessage: async (message) => nacl.sign.detached(message, keypair.secretKey) }, post);
  expect(result).toEqual({ state: "signed-in", userId: "account-1", address });
});

test("signing while signed in reports a link", async () => {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toBase58();
  const { post } = service(() => ({ status: 200, body: { linked: true, user: { id: "account-1", walletAddress: address } } }));
  const result = await signInWithSolana({ address, publicKey: keypair.publicKey.toBytes(), signMessage: async (message) => nacl.sign.detached(message, keypair.secretKey) }, post);
  expect(result).toEqual({ state: "linked", userId: "account-1", address });
});

test("each refusal is named", async () => {
  const keypair = Keypair.generate();
  const wallet = { address: keypair.publicKey.toBase58(), publicKey: keypair.publicKey.toBytes(), signMessage: async (message: Uint8Array) => nacl.sign.detached(message, keypair.secretKey) };
  const cases: [number, unknown, string][] = [
    [409, { code: "WALLET_OWNED" }, "owned-elsewhere"],
    [401, { code: "INVALID_NONCE" }, "expired"],
    [401, { code: "INVALID_SIGNATURE" }, "failed"],
    [429, {}, "unavailable"],
    [503, {}, "unavailable"],
  ];
  for (const [status, body, state] of cases) {
    const result = await signInWithSolana(wallet, service(() => ({ status, body })).post);
    expect(result.state, `${status}`).toBe(state);
    expect("message" in result && result.message.length > 0).toBe(true);
  }
});

test("a declined signature is reported as declined, and nothing is verified", async () => {
  const { post, calls } = service(checked);
  const result = await signInWithSolana({ signIn: async () => { throw new Error("User rejected the request."); } }, post);
  expect(result.state).toBe("rejected");
  expect(calls.map((call) => call.path)).toEqual(["/api/auth/solana/nonce"]);
});

test("a wallet that can neither sign in nor sign messages is unsupported", async () => {
  const { post, calls } = service(checked);
  const result = await signInWithSolana({ address: Keypair.generate().publicKey.toBase58() }, post);
  expect(result.state).toBe("unsupported");
  expect(calls).toEqual([]);
});

test("the old wallet challenge route is gone", async ({ request }) => {
  const response = await request.post("/api/account/wallets/challenge", { data: { address: Keypair.generate().publicKey.toBase58() } });
  expect(response.status()).toBe(404);
});
