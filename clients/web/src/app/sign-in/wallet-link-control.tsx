"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, QuietAction, RouteAction } from "@seametry/ui";
import { WalletState } from "../wallet-state";
import styles from "../site.module.css";

type LinkedWallet = { address: string; verified_at: string };

export function WalletLinkControl() {
  const { publicKey, connected, signMessage } = useWallet();
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

  async function link() {
    if (!address || !signMessage) return;
    setWorking(true);
    setProblem(undefined);
    try {
      const challengeResponse = await fetch("/api/account/wallets/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok) throw new Error(challenge.error);
      const signed = await signMessage(new TextEncoder().encode(challenge.message));
      const signature = btoa(Array.from(signed, (byte) => String.fromCharCode(byte)).join(""));
      const response = await fetch("/api/account/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, challengeId: challenge.id, signature }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setWallets((current) => [...(current ?? []), { address, verified_at: new Date().toISOString() }]);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Wallet linking did not complete.");
    } finally {
      setWorking(false);
    }
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
        signMessage ? <ContinueAction disabled={working} onClick={() => void link()}>Link this wallet</ContinueAction>
          : <p>This wallet does not support message signing here. Choose another wallet to link it.</p>
      ) : null}
      {!connected ? <RouteAction href="/app/allocation">Open the app</RouteAction> : null}
      {problem ? <p role="alert" className={styles.authProblem}>{problem}</p> : null}
    </section>
  );
}
