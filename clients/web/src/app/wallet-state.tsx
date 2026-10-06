"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { QuietAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { formatAmount } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import type { Balances } from "@/lib/wallet/balances";
import { useWalletFailure, walletNetwork } from "@/lib/wallet-provider";
import { NetworkBadge } from "./app/_shell/page-header";
import styles from "./site.module.css";

const noSubscription = () => () => {};

function middle(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

type BalanceReading = { state: "reading" } | { state: "read"; balances: Balances } | { state: "unavailable"; reason: string };

/**
 * Read each time the panel opens, so a figure is never older than the last
 * look at it. Every opening is its own request key; until that key has an
 * answer the panel is reading, so no state is set before the fetch returns.
 */
function useBalances(owner: string | undefined, network: "devnet" | "mainnet", opening: number | undefined): BalanceReading | undefined {
  const request = owner && opening !== undefined ? `${owner}|${network}|${opening}` : undefined;
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
 * components.md, Wallet state. A native disclosure, so opening it by
 * keyboard and announcing it need no script of this component's own.
 * Logging in signs nothing and moves nothing, so it is never a Key.
 */
export function WalletState() {
  const { publicKey, connected, connecting, wallets, wallet, select, connect, disconnect } = useWallet();
  const { failure, clear } = useWalletFailure();
  // A silent reconnect on reload may fail quietly; only a choice made here
  // earns an error message.
  const [chose, setChose] = useState(false);
  const [opening, setOpening] = useState<number>();
  const address = publicKey?.toBase58();
  const network = walletNetwork(usePathname());
  const reading = useBalances(connected ? address : undefined, network, opening);
  const connectionError = chose && !connected ? failure : undefined;
  // The server sees no wallet, while a browser with one installed lists it on
  // its first render, so the two disagreed and React redrew the header (error
  // #418) for every visitor with a wallet. The list waits until after the
  // page has hydrated; false on the server and during hydration, true after.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);

  const choose = (name: WalletName) => {
    clear();
    setChose(true);
    // Choosing the wallet already selected (after declining its prompt, say)
    // does not change the adapter, so the provider will not connect again on
    // its own. The provider is already subscribed to that adapter, so asking
    // it directly is safe; its error reaches useWalletFailure.
    if (wallet?.adapter.name === name) void connect().catch(() => {});
    else select(name);
  };

  return (
    <details className={styles.walletState} onToggle={(event) => setOpening(event.currentTarget.open ? Date.now() : undefined)}>
      <summary data-connected={connected || undefined}>
        {connecting ? <span className={styles.walletLabel}>Connecting</span> : connected && address ? <span className={styles.walletLabel} aria-label={`Wallet ${address}`}>{middle(address)}</span> : <span className={styles.walletLabel}>Log in</span>}
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
        ) : !hydrated ? (
          <p>Looking for wallets in this browser.</p>
        ) : wallets.length === 0 ? (
          <p>No wallet was detected in this browser. Open the site in a browser with a Solana wallet extension, or use your wallet&apos;s browser on a phone.</p>
        ) : (
          wallets.map((wallet) => (
            <button className={styles.walletChoice} type="button" key={wallet.adapter.name} disabled={connecting} onClick={() => choose(wallet.adapter.name)}>
              <Image className={styles.walletBrand} src={wallet.adapter.icon} width={24} height={24} alt="" unoptimized />
              <span>Connect {wallet.adapter.name}</span>
            </button>
          ))
        )}
        {connectionError ? <p role="alert">Connection was not completed: {connectionError}</p> : null}
      </div>
    </details>
  );
}
