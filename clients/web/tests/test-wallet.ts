import type { Page } from "@playwright/test";

/**
 * Registers a Wallet Standard wallet in the page. A trusted wallet already
 * exposes its account before connect is called, as Phantom does on a site it
 * has approved, so its connect completes without waiting on anything.
 */
/**
 * rewrites: transactions the wallet returns in place of the ones it was given,
 * keyed by the given transaction's base64, as Phantom returns a transaction
 * with its guard instructions added; built in Node, where the message can be
 * recompiled.
 */
/**
 * signsIn adds solana:signIn and solana:signMessage, so Sign in with Solana
 * can be exercised: the wallet signs whatever message the page asks for
 * with a fixed 64-byte signature, and the auth routes are answered by the
 * test. declinesSignIn throws Phantom's cancel wording instead. name sets
 * the wallet's display name, for ordering tests.
 */
export async function registerTestWallet(page: Page, { trusted, signs = false, declines = false, rewrites = {}, signsIn = false, declinesSignIn = false, name = "Test wallet", chains = ["solana:mainnet", "solana:devnet"] }: { trusted: boolean; signs?: boolean; declines?: boolean; rewrites?: Record<string, string>; signsIn?: boolean; declinesSignIn?: boolean; name?: string; chains?: string[] }) {
  await page.addInitScript(({ trustedWallet, signsTransactions, declinesTransactions, rewritten, signsInMessages, declinesSignInMessages, walletName, accountChains }) => {
    // A signing wallet writes a distinct 64-byte signature into the first
    // signature slot (byte 0 is the compact count) and leaves the message
    // alone, as a real wallet does, so flows that read the signed
    // transaction's signature can be exercised without a key.
    let signed = 0;
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
    const sign = (given: Uint8Array) => {
      const replacement = rewritten[toBase64(given)];
      const transaction = replacement ? fromBase64(replacement) : given;
      if (!signsTransactions) return transaction;
      signed += 1;
      const copy = transaction.slice();
      copy.fill(signed, 1, 65);
      return copy;
    };
    const listeners = new Set<(properties: { accounts: unknown[] }) => void>();
    const publicKey = new Uint8Array(32).fill(1);
    const account = {
      address: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d",
      publicKey,
      chains: accountChains,
      features: signsInMessages ? ["solana:signTransaction", "solana:signIn", "solana:signMessage"] : ["solana:signTransaction"],
      label: "Test account",
      icon: undefined,
    };
    let accounts: typeof account[] = trustedWallet ? [account] : [];
    const wallet = {
      version: "1.0.0",
      name: walletName,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      chains: ["solana:mainnet", "solana:devnet"],
      get accounts() { return accounts; },
      features: {
        "standard:events": {
          version: "1.0.0",
          on: (_event: string, listener: (properties: { accounts: unknown[] }) => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            accounts = [account];
            listeners.forEach((listener) => listener({ accounts }));
            return { accounts };
          },
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
            // Phantom's wording when the holder presses Cancel.
            if (declinesTransactions) throw new Error("User rejected the request.");
            return inputs.map((input) => ({ signedTransaction: sign(input.transaction) }));
          },
        },
        ...(signsInMessages ? {
          "solana:signIn": {
            version: "1.0.0",
            signIn: async (...inputs: Record<string, string>[]) => {
              if (declinesSignInMessages) throw new Error("User rejected the request.");
              accounts = [account];
              listeners.forEach((listener) => listener({ accounts }));
              return inputs.map((input) => {
                const text = `${input.domain} wants you to sign in with your Solana account:\n${account.address}\n\n${input.statement}\n\nURI: ${input.uri}\nVersion: ${input.version}\nChain ID: ${input.chainId}\nNonce: ${input.nonce}\nIssued At: ${input.issuedAt}\nExpiration Time: ${input.expirationTime}`;
                return { account, signedMessage: new TextEncoder().encode(text), signature: new Uint8Array(64).fill(7) };
              });
            },
          },
          "solana:signMessage": {
            version: "1.0.0",
            signMessage: async (...inputs: { message: Uint8Array }[]) => {
              if (declinesSignInMessages) throw new Error("User rejected the request.");
              return inputs.map((input) => ({ signedMessage: input.message, signature: new Uint8Array(64).fill(7) }));
            },
          },
        } : {}),
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent<{ register: (entry: unknown) => void }>).detail.register(wallet);
    });
  }, { trustedWallet: trusted, signsTransactions: signs, declinesTransactions: declines, rewritten: rewrites, signsInMessages: signsIn, declinesSignInMessages: declinesSignIn, walletName: name, accountChains: chains });
}
