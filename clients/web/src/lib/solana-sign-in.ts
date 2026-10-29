import type { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { createSignInMessageText } from "@solana/wallet-standard-util";

// Sign in with Solana, the browser half (server/auth/src/solana-sign-in.mjs).
// The auth service writes the whole message; the wallet signs it, through
// solana:signIn when it has it and over the same text with signMessage when
// it does not. Signed in already, the same signature links the wallet.

export type SignInWallet = {
  address?: string;
  publicKey?: Uint8Array;
  signIn?: (input: SolanaSignInInput) => Promise<SolanaSignInOutput>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
};

export type SolanaSignInResult =
  | { state: "signed-in"; userId: string; address: string }
  | { state: "linked"; userId: string; address: string }
  | { state: "rejected" | "owned-elsewhere" | "expired" | "unsupported" | "unavailable" | "failed"; message: string };

const messages = {
  rejected: "The wallet declined to sign. Nothing changed.",
  "owned-elsewhere": "This wallet belongs to another Seametry account. Sign out and sign in with it to use that account.",
  expired: "The sign-in request expired. Try again.",
  unsupported: "This wallet cannot sign a sign-in message. Choose another wallet.",
  unavailable: "Sign-in is unavailable right now. Try again in a minute.",
  failed: "The wallet signature could not be verified. Try again.",
} as const;

const refused = (state: keyof typeof messages): SolanaSignInResult => ({ state, message: messages[state] });

const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));

function declined(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  const code = (error as { code?: unknown; error?: { code?: unknown } } | null)?.code ?? (error as { error?: { code?: unknown } } | null)?.error?.code;
  return code === 4001 || /reject|declin|denied|cancel/i.test(text);
}

async function postJson(post: typeof fetch, path: string, body: unknown) {
  const response = await post(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  let parsed: Record<string, unknown> = {};
  try {
    parsed = await response.json();
  } catch {
    parsed = {};
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

export async function signInWithSolana(wallet: SignInWallet, post: typeof fetch = fetch): Promise<SolanaSignInResult> {
  if (!wallet.signIn && !(wallet.signMessage && wallet.address && wallet.publicKey)) return refused("unsupported");
  let nonce;
  try {
    nonce = await postJson(post, "/api/auth/solana/nonce", {});
  } catch {
    return refused("unavailable");
  }
  const input = nonce.body.input as SolanaSignInInput | undefined;
  if (!nonce.ok || !input?.nonce) return refused("unavailable");

  let output: { address: string; publicKey: Uint8Array; signedMessage: Uint8Array; signature: Uint8Array };
  try {
    if (wallet.signIn) {
      const signed = await wallet.signIn(input);
      output = { address: signed.account.address, publicKey: new Uint8Array(signed.account.publicKey), signedMessage: signed.signedMessage, signature: signed.signature };
    } else {
      const address = wallet.address as string;
      const signedMessage = new TextEncoder().encode(createSignInMessageText({ ...input, domain: input.domain ?? "", address }));
      const signature = await (wallet.signMessage as (message: Uint8Array) => Promise<Uint8Array>)(signedMessage);
      output = { address, publicKey: wallet.publicKey as Uint8Array, signedMessage, signature };
    }
  } catch (error) {
    return refused(declined(error) ? "rejected" : "failed");
  }

  let verified;
  try {
    verified = await postJson(post, "/api/auth/solana/verify", {
      nonce: input.nonce,
      output: { address: output.address, publicKey: base64(output.publicKey), signedMessage: base64(output.signedMessage), signature: base64(output.signature) },
    });
  } catch {
    return refused("unavailable");
  }
  if (verified.ok) {
    const user = verified.body.user as { id?: unknown } | undefined;
    if (typeof user?.id !== "string") return refused("failed");
    return verified.body.linked === true
      ? { state: "linked", userId: user.id, address: output.address }
      : { state: "signed-in", userId: user.id, address: output.address };
  }
  if (verified.status === 409) return refused("owned-elsewhere");
  if (verified.status === 401 && verified.body.code === "INVALID_NONCE") return refused("expired");
  if (verified.status === 401 || verified.status === 400) return refused("failed");
  return refused("unavailable");
}
