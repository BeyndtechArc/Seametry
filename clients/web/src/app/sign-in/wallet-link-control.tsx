"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, QuietAction, RouteAction } from "@seametry/ui";
import { signInWithSolana } from "@/lib/solana-sign-in";
import { WalletState } from "../wallet-state";
import styles from "../site.module.css";

type LinkedWallet = { address: string; verified_at: string };

export function WalletLinkControl() {
  const { publicKey, connected, signIn, signMessage } = useWallet();
  const [wallets, setWallets] = useState<LinkedWallet[]>();
  const [problem, setProblem] = useState<string>();
  const [working, setWorking] = useState(false);
  const address = publicKey?.toBase58();

  useEffect(() => {
    let current = true;
    fetch("/api/account/wallets", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Linked wallets could not be read.");
        if (current) setWallets(body.wallets);
      })
      .catch((error: unknown) => {
        if (current) setProblem(error instanceof Error ? error.message : "Linked wallets could not be read.");
      });
    return () => { current = false; };
  }, []);

  // Signing in with the wallet while this session is open links it to this
  // account (server/auth/src/solana-sign-in.mjs).
  async function link() {
    if (!address || !publicKey || !(signIn || signMessage)) return;
    setWorking(true);
    setProblem(undefined);
    const result = await signInWithSolana({ address, publicKey: publicKey.toBytes(), signIn, signMessage });
    if (result.state === "linked") {
      setWallets((current) => [...(current ?? []).filter((wallet) => wallet.address !== address), { address, verified_at: new Date().toISOString() }]);
    } else if (result.state === "signed-in") {
      setProblem("This session ended before the wallet was linked. Reload to see the account you are signed in to.");
    } else {
      setProblem(result.message);
    }
    setWorking(false);
  }

  async function unlink(addressToRemove: string) {
    setWorking(true);
    setProblem(undefined);
    try {
      const response = await fetch("/api/account/wallets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addressToRemove }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error);
      }
      setWallets((current) => current?.filter((wallet) => wallet.address !== addressToRemove));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Wallet unlinking did not complete.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className={styles.walletLinks} aria-label="Linked wallets">
      <b>Linked wallets</b>
      {wallets === undefined && !problem ? <p role="status">Reading linked wallets.</p> : null}
      {wallets?.length === 0 ? <p>No wallet linked yet.</p> : null}
      {wallets?.map((wallet) => (
        <div key={wallet.address}>
          <code>{wallet.address}</code>
          <QuietAction disabled={working} onClick={() => void unlink(wallet.address)}>Unlink wallet</QuietAction>
        </div>
      ))}
      <WalletState />
      {connected && address && !wallets?.some((wallet) => wallet.address === address) ? (
        signIn || signMessage ? <ContinueAction disabled={working} onClick={() => void link()}>Link this wallet</ContinueAction>
          : <p>This wallet does not support message signing here. Choose another wallet to link it.</p>
      ) : null}
      {!connected ? <RouteAction href="/app/allocation">Open the app</RouteAction> : null}
      {problem ? <p role="alert" className={styles.authProblem}>{problem}</p> : null}
    </section>
  );
}
