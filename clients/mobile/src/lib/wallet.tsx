import { createContext, useContext, type ReactNode } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { AddressType, PhantomProvider, useAccounts, useConnect, useDisconnect, useSolana } from "@phantom/react-native-sdk";
import { PHANTOM_APP_ID, SCHEME } from "./config";

// One interface for every way of holding keys, so a screen never knows which
// wallet signed. Phantom Connect first (Google or Apple sign-in, a wallet the
// user holds, nothing for Seametry to custody); Mobile Wallet Adapter for any
// Android wallet comes next and implements the same shape.

export type Wallet =
  | { state: "unavailable"; reason: string }
  | { state: "signed-out"; signIn: (provider: "google" | "apple") => Promise<void>; signingIn: boolean }
  | { state: "signed-in"; address: string; signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>; signOut: () => Promise<void> };

const WalletContext = createContext<Wallet>({ state: "unavailable", reason: "No wallet provider is mounted." });

export const useWallet = () => useContext(WalletContext);

function PhantomWallet({ children }: { children: ReactNode }) {
  const { addresses, isConnected } = useAccounts();
  const { connect, isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { solana } = useSolana();
  const address = addresses.find((entry) => entry.addressType === AddressType.solana)?.address;
  const wallet: Wallet =
    isConnected && address
      ? {
          state: "signed-in",
          address,
          // Sign only: Seametry's /submit broadcasts, after checking the
          // transaction is the one its simulation approved.
          signTransaction: async (transaction) => (await solana.signTransaction(transaction)) as VersionedTransaction,
          signOut: () => disconnect(),
        }
      : { state: "signed-out", signingIn: isConnecting, signIn: async (provider) => void (await connect({ provider })) };
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!PHANTOM_APP_ID) {
    return (
      <WalletContext.Provider value={{ state: "unavailable", reason: "Signing is unavailable in this build: it has no Phantom Connect app id. You can still build and inspect a plan." }}>
        {children}
      </WalletContext.Provider>
    );
  }
  return (
    <PhantomProvider
      config={{
        appId: PHANTOM_APP_ID,
        scheme: SCHEME,
        providers: ["google", "apple"],
        addressTypes: [AddressType.solana],
        authOptions: { redirectUrl: `${SCHEME}://phantom-auth-callback` },
      }}
      appName="Seametry"
    >
      <PhantomWallet>{children}</PhantomWallet>
    </PhantomProvider>
  );
}
