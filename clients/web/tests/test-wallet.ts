import type { Page } from "@playwright/test";

/**
 * Registers a Wallet Standard wallet in the page. A trusted wallet already
 * exposes its account before connect is called, as Phantom does on a site it
 * has approved, so its connect completes without waiting on anything.
 */
export async function registerTestWallet(page: Page, { trusted }: { trusted: boolean }) {
  await page.addInitScript((trustedWallet) => {
    const listeners = new Set<(properties: { accounts: unknown[] }) => void>();
    const publicKey = new Uint8Array(32).fill(1);
    const account = {
      address: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d",
      publicKey,
      chains: ["solana:mainnet", "solana:devnet"],
      features: ["solana:signTransaction"],
      label: "Test account",
      icon: undefined,
    };
    let accounts: typeof account[] = trustedWallet ? [account] : [];
    const wallet = {
      version: "1.0.0",
      name: "Test wallet",
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
          signTransaction: async (...inputs: unknown[]) => inputs,
        },
      },
    };
    window.addEventListener("wallet-standard:app-ready", (event) => {
      (event as CustomEvent<{ register: (entry: unknown) => void }>).detail.register(wallet);
    });
  }, trusted);
}
