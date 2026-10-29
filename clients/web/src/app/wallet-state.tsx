"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { ContinueAction, QuietAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { formatAmount, formatBalance } from "@/lib/amount";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import type { Balances } from "@/lib/wallet/balances";
import { announceSessionChange, useAccountSession } from "@/lib/account-session";
import { authClient } from "@/lib/auth-client";
import { signInWithSolana, type SignInWallet } from "@/lib/solana-sign-in";
import { AccountMenu, copyText, realEmail, useLinkedWallets, useSignInMethods } from "./account-menu";
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

type ChainedAdapter = { wallet?: { accounts?: readonly { address: string; chains?: readonly string[] }[] } };

/** The networks the wallet says this account is on, when a Wallet Standard wallet says. */
function accountChains(adapter: object, address: string) {
  return (adapter as ChainedAdapter).wallet?.accounts?.find((account) => account.address === address)?.chains;
}

/**
 * components.md, Wallet state, and the account chip. Connected or signed in,
 * a native disclosure, so opening it by keyboard and announcing it need no
 * script of this component's own; it holds the wallet and the account menu.
 * Neither, the same control opens the connect modal, which also signs in when
 * the account service is configured (accountConfigured).
 */
export function WalletState({ accountConfigured = false }: { accountConfigured?: boolean }) {
  const { publicKey, connected, connecting, wallet, disconnect } = useWallet();
  const session = useAccountSession(accountConfigured);
  const signedIn = session.state === "signed-in";
  const user = session.state === "signed-in" ? session.user : undefined;
  const wallets = useLinkedWallets(signedIn);
  const methods = useSignInMethods(signedIn);
  const [choosing, setChoosing] = useState<false | "connect" | "link">(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [copied, setCopied] = useState(false);
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
  const chains = connected && address && wallet ? accountChains(wallet.adapter, address) : undefined;
  const wrongNetwork = Boolean(chains && chains.length > 0 && !chains.includes(`solana:${network}`));
  const linked = signedIn && connected && address && wallets ? wallets.some((entry) => entry.address === address) : undefined;
  const email = user ? realEmail(user) : undefined;
  const accountState = !user ? "signed-out" : !connected ? "email" : email ? "wallet-email" : "wallet";
  const networkName = network === "devnet" ? "Devnet" : "Mainnet";

  async function linkConnected() {
    if (!wallet || !publicKey) return;
    setWorking(true);
    setProblem(undefined);
    const adapter = wallet.adapter as { signIn?: SignInWallet["signIn"]; signMessage?: SignInWallet["signMessage"] };
    const result = await signInWithSolana({
      address: publicKey.toBase58(),
      publicKey: publicKey.toBytes(),
      signIn: adapter.signIn ? (input) => adapter.signIn!(input) : undefined,
      signMessage: adapter.signMessage ? (message) => adapter.signMessage!(message) : undefined,
    });
    if (result.state === "linked" || result.state === "signed-in") announceSessionChange();
    else setProblem(result.message);
    setWorking(false);
  }

  async function signOut() {
    setWorking(true);
    setProblem(undefined);
    const result = await authClient.signOut();
    if (result.error) setProblem(result.error.message ?? "Could not end this session.");
    announceSessionChange();
    setWorking(false);
  }

  function switchWallet() {
    if (details.current) details.current.open = false;
    void disconnect().finally(() => setChoosing("connect"));
  }

  return (
    <>
    <details ref={details} className={styles.walletState} data-testid="wallet-state" onToggle={(event) => { if (event.currentTarget.open) setRefresh((value) => value + 1); }}>
      <summary
        id="app-wallet"
        onClick={(event) => {
          if (connected || signedIn) return;
          event.preventDefault();
          setChoosing("connect");
        }}
        data-connected={connected || undefined}
        data-account={accountState}
        data-linked={linked === undefined ? undefined : String(linked)}
        data-network={wrongNetwork ? "wrong" : undefined}
        aria-label={connected && address ? `Wallet ${address}. ${displayedBalance ?? "Balance loading or unavailable"}${wrongNetwork ? `. Not on ${networkName}` : ""}` : user ? `Account ${email ?? user.id.slice(0, 8)}` : "Connect wallet"}
      >
        {email ? <span className={styles.accountInitial} data-testid="account-initial" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span> : null}
        {connecting ? <span className={styles.walletLabel}>Connecting</span> : connected && address ? (
          <>
            {displayedBalance ? <span className={styles.walletBalance}>{displayedBalance}</span> : reading?.state === "unavailable" ? <span className={styles.walletBalance}>Wallet</span> : (
              <span className={styles.walletBalance} data-testid="balance-reading" aria-hidden="true"><span className={styles.balanceSkeleton} /></span>
            )}
            <span className={styles.walletLabel}>{middle(address)}</span>
          </>
        ) : user ? (
          <span className={styles.walletLabel}>{wallets?.length === 0 ? "Link wallet" : "Connect"}</span>
        ) : <span className={styles.walletLabel}>Connect</span>}
        <span className={styles.walletIcon} data-connected={connected || undefined}>
          {connected && wallet ? <Image src={wallet.adapter.icon} width={22} height={22} alt="" unoptimized /> : <Icon name="wallet" />}
          {wrongNetwork || linked === false ? <span className={styles.chipWarning} aria-hidden="true" /> : null}
        </span>
      </summary>
      <div className={styles.walletPanel}>
        {connected && address && wallet ? (
          <div className={styles.account} data-testid="wallet-account">
            <header>
              <Image className={styles.walletBrand} src={wallet.adapter.icon} width={28} height={28} alt="" unoptimized />
              <b>{wallet.adapter.name}</b>
              <NetworkBadge network={networkName} />
            </header>
            <code>{address}</code>
            {wrongNetwork ? <p role="alert" className={styles.authProblem}>{wallet.adapter.name} is not set to Solana {network}. Switch its network to {network}.</p> : null}
            {linked === false ? (
              <div className={styles.connectProblem}>
                <p>This wallet is not linked to your account.</p>
                <ContinueAction disabled={working} onClick={() => void linkConnected()}>Link this wallet</ContinueAction>
              </div>
            ) : null}
            <Holdings reading={reading} network={network} />
            <div className={styles.connectActions}>
              <QuietAction aria-label="Copy address" onClick={async () => setCopied(await copyText(address))}>Copy address</QuietAction>
              <QuietAction onClick={switchWallet}>Switch wallet</QuietAction>
              <QuietAction icon="wallet" onClick={() => void disconnect()}>Disconnect wallet</QuietAction>
            </div>
            {copied ? <p role="status">Address copied</p> : null}
          </div>
        ) : null}
        {user ? (
          <AccountMenu user={user} wallets={wallets} methods={methods} working={working} onLink={() => setChoosing("link")} onSignOut={() => void signOut()} />
        ) : null}
        {problem ? <p role="alert" className={styles.authProblem}>{problem}</p> : null}
      </div>
    </details>
    <ConnectModal open={choosing !== false} link={choosing === "link"} onClose={() => setChoosing(false)} onConnected={() => { if (details.current) details.current.open = true; }} session={session} />
    </>
  );
}
