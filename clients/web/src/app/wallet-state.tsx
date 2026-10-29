"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { QuietAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { formatAmount, formatBalance } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import type { Balances } from "@/lib/wallet/balances";
import { useAccountSession } from "@/lib/account-session";
import { walletNetwork } from "@/lib/wallet-provider";
import { NetworkBadge } from "./app/_shell/page-header";
import { ConnectModal } from "./connect-modal";
import styles from "./site.module.css";

function middle(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

type BalanceReading = { state: "reading" } | { state: "read"; balances: Balances } | { state: "unavailable"; reason: string };

/**
 * Read on connection and each time the panel opens. Every refresh has its
 * own request key; until that key has an
 * answer the panel is reading, so no state is set before the fetch returns.
 */
function useBalances(owner: string | undefined, network: "devnet" | "mainnet", refresh: number): BalanceReading | undefined {
  const request = owner ? `${owner}|${network}|${refresh}` : undefined;
  const [answer, setAnswer] = useState<{ request: string; reading: BalanceReading }>();
  useEffect(() => {
    if (!request || !owner) return;
    let current = true;
    const settle = (reading: BalanceReading) => {
      if (current) setAnswer({ request, reading });
    };
    fetch(`/api/wallet/balances?owner=${owner}&network=${network}`)
      .then(async (response) => {
        const body = await response.json();
        settle(response.ok ? { state: "read", balances: body as Balances } : { state: "unavailable", reason: body.error });
      })
      .catch((error: unknown) => settle({ state: "unavailable", reason: error instanceof Error ? error.message : "The balance request did not complete." }));
    return () => {
      current = false;
    };
  }, [request, owner, network]);
  if (!request) return undefined;
  return answer?.request === request ? answer.reading : { state: "reading" };
}

function Holdings({ reading, network }: { reading: BalanceReading | undefined; network: "devnet" | "mainnet" }) {
  if (!reading || reading.state === "reading") {
    return <p className={styles.holdingsNote} data-state="reading">Reading balances from Solana {network}</p>;
  }
  if (reading.state === "unavailable") {
    return <p className={styles.holdingsNote} role="status">Balances unavailable. {reading.reason}</p>;
  }
  const { balances } = reading;
  return (
    <>
      <dl className={styles.holdings}>
        {balances.holdings.map((holding) => (
          <div key={holding.asset}>
            <dt>{holding.asset}</dt>
            <dd>{formatAmount(holding.atoms, holding.scale)}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.holdingsNote}>
        {balances.source}, observed <time dateTime={balances.observedAt}>{relativeEvidenceAge(balances.observedAt)}</time> ago
      </p>
    </>
  );
}

/**
 * components.md, Wallet state. Connected, a native disclosure, so opening it
 * by keyboard and announcing it need no script of this component's own.
 * Not connected, the same control opens the connect modal, which also signs
 * in when the account service is configured (accountConfigured).
 */
export function WalletState({ accountConfigured = false }: { accountConfigured?: boolean }) {
  const { publicKey, connected, connecting, wallet, disconnect } = useWallet();
  const session = useAccountSession(accountConfigured);
  const [choosing, setChoosing] = useState(false);
  // After the modal connects a wallet, the disclosure opens on its balances,
  // as it did when the wallet list lived inside it.
  const details = useRef<HTMLDetailsElement>(null);
  const [refresh, setRefresh] = useState(0);
  const address = publicKey?.toBase58();
  const pathname = usePathname();
  const network = walletNetwork(pathname);
  const reading = useBalances(connected ? address : undefined, network, refresh);
  const visibleAsset = network === "mainnet" ? "USDC" : "SOL";
  const visibleHolding = reading?.state === "read" ? reading.balances.holdings.find((holding) => holding.asset === visibleAsset) : undefined;
  const displayedBalance = visibleHolding ? `${formatBalance(visibleHolding.atoms, visibleHolding.scale)} ${visibleAsset}` : undefined;

  return (
    <>
    <details ref={details} className={styles.walletState} data-testid="wallet-state" onToggle={(event) => { if (event.currentTarget.open) setRefresh((value) => value + 1); }}>
      <summary id="app-wallet" onClick={(event) => {
        if (connected) return;
        event.preventDefault();
        setChoosing(true);
      }} data-connected={connected || undefined} aria-label={connected && address ? `Wallet ${address}. ${displayedBalance ?? "Balance loading or unavailable"}` : "Connect wallet"}>
        {connecting ? <span className={styles.walletLabel}>Connecting</span> : connected && address ? <><span className={styles.walletBalance}>{displayedBalance ?? "Wallet"}</span><span className={styles.walletLabel}>{middle(address)}</span></> : <span className={styles.walletLabel}>Connect</span>}
        <span className={styles.walletIcon} data-connected={connected || undefined}>
          {connected && wallet ? <Image src={wallet.adapter.icon} width={22} height={22} alt="" unoptimized /> : <Icon name="wallet" />}
        </span>
      </summary>
      <div className={styles.walletPanel}>
        {connected && address && wallet ? (
          <div className={styles.account} data-testid="wallet-account">
            <header>
              <Image className={styles.walletBrand} src={wallet.adapter.icon} width={28} height={28} alt="" unoptimized />
              <b>{wallet.adapter.name}</b>
              <NetworkBadge network={network === "devnet" ? "Devnet" : "Mainnet"} />
            </header>
            <code>{address}</code>
            <Holdings reading={reading} network={network} />
            <QuietAction icon="wallet" onClick={() => void disconnect()}>Disconnect wallet</QuietAction>
          </div>
        ) : null}
      </div>
    </details>
    <ConnectModal open={choosing} onClose={() => setChoosing(false)} onConnected={() => { if (details.current) details.current.open = true; }} session={session} />
    </>
  );
}
