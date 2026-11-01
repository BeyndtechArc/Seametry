"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { ContinueAction, QuietAction } from "@seametry/ui";
import { Icon } from "@seametry/ui/icons";
import { AuthDialog } from "@seametry/ui/modal-sheet";
import { StatusMark } from "@seametry/ui/timeline";
import { authClient } from "@/lib/auth-client";
import type { AccountSession } from "@/lib/account-session";
import { announceSessionChange } from "@/lib/account-session";
import { signInWithSolana, type SignInWallet } from "@/lib/solana-sign-in";
import { useWalletFailure } from "@/lib/wallet-provider";
import styles from "./site.module.css";

const noSubscription = () => () => {};
const subscribeToPlanUrl = (changed: () => void) => {
  window.addEventListener("seametry:plan-url", changed);
  window.addEventListener("popstate", changed);
  return () => {
    window.removeEventListener("seametry:plan-url", changed);
    window.removeEventListener("popstate", changed);
  };
};

export function walletBrowseLink(pageUrl: string, wallet: "phantom" | "solflare") {
  const page = new URL(pageUrl);
  const base = wallet === "phantom" ? "https://phantom.com/ul/browse/" : "https://solflare.com/ul/v1/browse/";
  return `${base}${encodeURIComponent(page.href)}?ref=${encodeURIComponent(page.origin)}`;
}

// Named wallets first, in this order; every other detected wallet follows in
// the order the browser announced it.
const preferred = ["Phantom", "Solflare", "Backpack"];
const installLinks = [
  { name: "Phantom", href: "https://phantom.com/download" },
  { name: "Solflare", href: "https://solflare.com/download" },
  { name: "Backpack", href: "https://backpack.app/download" },
];

type Step =
  | { kind: "choose" }
  | { kind: "connecting"; name: WalletName }
  | { kind: "signing"; name: WalletName; phase: "wallet" | "confirming" }
  | { kind: "problem"; name: WalletName; message: string; retry: boolean };

/**
 * docs auth-design section 5, Connect modal. One dialog for connecting a
 * wallet and, signed out, signing in with it (Sign in with Solana), or with
 * Google. Email sign-in is not offered until it exists. The native dialog
 * gives the modal its focus containment, Escape and return of focus.
 */
export function ConnectModal({ open, onClose, onConnected, session, link = false }: { open: boolean; onClose: () => void; onConnected?: () => void; session: AccountSession & { refresh: () => void }; link?: boolean }) {
  const { wallets, wallet, connected, select, connect } = useWallet();
  const { clear } = useWalletFailure();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const pageUrl = useSyncExternalStore(subscribeToPlanUrl, () => window.location.href, () => "");
  const phone = hydrated && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  const signedOut = session.state === "signed-out";
  const ordered = useMemo(() => {
    const rank = (name: string) => (preferred.includes(name) ? preferred.indexOf(name) : preferred.length);
    return [...wallets].sort((a, b) => rank(a.adapter.name) - rank(b.adapter.name));
  }, [wallets]);

  type SigningAdapter = { publicKey: { toBase58(): string; toBytes(): Uint8Array } | null; signIn?: SignInWallet["signIn"]; signMessage?: SignInWallet["signMessage"] };
  const signing = (adapter: object) => adapter as SigningAdapter;

  async function signInWith(name: WalletName, adapter: SigningAdapter) {
    const key = adapter.publicKey;
    if (!key) return;
    setStep({ kind: "signing", name, phase: "wallet" });
    const result = await signInWithSolana(
      {
        address: key.toBase58(),
        publicKey: key.toBytes(),
        signIn: adapter.signIn ? (input) => adapter.signIn!(input) : undefined,
        signMessage: adapter.signMessage ? (message) => adapter.signMessage!(message) : undefined,
      },
      fetch,
      { onSigned: () => setStep({ kind: "signing", name, phase: "confirming" }) },
    );
    if (result.state === "signed-in" || result.state === "linked") {
      announceSessionChange();
      finish();
      return;
    }
    setStep({ kind: "problem", name, message: result.message, retry: result.state !== "owned-elsewhere" && result.state !== "unsupported" });
  }

  // When the chosen wallet connects: signed out, with a wallet that can sign
  // a message, sign in with it; otherwise the connection was the whole task.
  useEffect(() => {
    if (step.kind !== "connecting") return;
    const adapter = wallets.find((entry) => entry.adapter.name === step.name)?.adapter;
    if (!adapter) return;
    const connectedNow = () => {
      const candidate = signing(adapter);
      if ((signedOut || link) && (candidate.signIn || candidate.signMessage)) void signInWith(step.name, candidate);
      else finish();
    };
    // The wallet's own error text is not shown; it is often an internal code.
    const refused = () => {
      setStep({ kind: "problem", name: step.name, message: `${step.name} did not complete the connection. Nothing changed.`, retry: true });
    };
    adapter.on("connect", connectedNow);
    adapter.on("error", refused);
    return () => {
      adapter.off("connect", connectedNow);
      adapter.off("error", refused);
    };
    // The handlers read the step and session at the moment they fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, wallets, signedOut, link]);

  // The native modal dialog makes the page behind it inert, but Tab can still
  // leave for the browser's own controls; this keeps it cycling inside.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const keep = (event: KeyboardEvent) => {
      const dialog = body.current?.closest("dialog");
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keep);
    return () => document.removeEventListener("keydown", keep);
  }, [open]);

  const choose = (name: WalletName) => {
    clear();
    setStep({ kind: "connecting", name });
    // Choosing the wallet already selected does not change the adapter, so the
    // provider will not connect again on its own; ask it directly.
    if (wallet?.adapter.name === name) void connect().catch(() => {});
    else select(name);
  };

  const close = () => {
    setStep({ kind: "choose" });
    onClose();
  };

  // The wallet is connected: the modal's task is over, signed in or not.
  function finish() {
    setStep({ kind: "choose" });
    onClose();
    onConnected?.();
  }

  const handoff = phone && pageUrl && !connected ? {
    phantom: walletBrowseLink(pageUrl, "phantom"),
    solflare: walletBrowseLink(pageUrl, "solflare"),
  } : undefined;
  const allocation = pathname === "/app/allocation";

  const title = signedOut ? "Sign in to Seametry" : link ? "Link a wallet" : "Connect a wallet";
  // Only a session read as signed in may say so: while it is being read, or
  // where accounts are not configured, the dialog only connects.
  const connectLead = "Connecting a wallet shows its balances here; it asks for no signature.";
  const lead = signedOut
    ? "Your wallet is your account. Signing in signs a message, never a transaction."
    : link
      ? "Choose the wallet to link to your account. Linking signs a message, never a transaction."
      : session.state === "signed-in"
        ? `You are signed in. ${connectLead}`
        : session.state === "unconfigured"
          ? `Account sign-in is unavailable here. ${connectLead}`
          : connectLead;
  const detected = new Set(ordered.map((entry) => entry.adapter.name as string));
  const installable = installLinks.filter((entry) => !detected.has(entry.name));
  const pending = step.kind === "connecting" || step.kind === "signing" ? step : null;

  return (
    <AuthDialog
      open={open}
      onClose={close}
      register={signedOut || link ? "Account" : "Wallet"}
      title={title}
      lead={lead}
      closeLabel="Close"
      footer={
        <div className={styles.authFooterLine}>
          <span>Non-custodial. Nothing moves without your signature.</span>
          <span className={styles.authLegal}><a href="/terms">Terms</a><a href="/privacy-policy">Privacy policy</a></span>
        </div>
      }
    >
      <div ref={body} className={styles.connectModal} data-testid="connect-modal" data-step={step.kind}>
        {pending ? (
          <div className={styles.authPending}>
            <StatusMark state="running" />
            <div>
              <p role="status">
                {pending.kind === "connecting" ? `Approve the connection in ${pending.name}.` : pending.phase === "wallet" ? `Check ${pending.name} to sign in.` : "Confirming the signature."}
              </p>
              <span className={styles.authPendingHint}>
                {pending.kind === "connecting" ? "Waiting for the wallet." : pending.phase === "wallet" ? "The wallet shows a message to sign. It is not a transaction." : "Checking the signature with Seametry."}
              </span>
            </div>
          </div>
        ) : null}

        {step.kind === "problem" ? (
          <div className={styles.dialogProblem}>
            <StatusMark state="stopped" />
            <p role="alert">{step.message}</p>
            <div className={styles.connectActions}>
              {step.retry ? <ContinueAction onClick={() => (connected && wallet ? void signInWith(step.name, signing(wallet.adapter)) : choose(step.name))}>Try again</ContinueAction> : null}
              {connected ? <QuietAction onClick={finish}>Continue without signing in</QuietAction> : <QuietAction onClick={() => setStep({ kind: "choose" })}>Choose another wallet</QuietAction>}
            </div>
          </div>
        ) : null}

        {step.kind === "choose" ? (
          <section className={styles.connectSection} aria-label="Wallets">
            {!hydrated ? (
              <p role="status" className={styles.authNote}>Looking for wallets in this browser.</p>
            ) : (
              <>
                {ordered.length === 0 ? <p className={styles.authNote}>No signing wallet is available in this browser. Install one, then reload this page.</p> : null}
                <ul className={styles.walletRows}>
                  {ordered.map((entry) => (
                    <li key={entry.adapter.name}>
                      <button className={styles.walletRow} type="button" aria-label={`Connect ${entry.adapter.name}`} onClick={() => choose(entry.adapter.name)}>
                        <Image className={styles.walletBrand} src={entry.adapter.icon} width={28} height={28} alt="" unoptimized />
                        <span className={styles.walletName}>{entry.adapter.name}</span>
                        <span className={styles.walletBadge} data-kind="detected">Detected</span>
                      </button>
                    </li>
                  ))}
                  {installable.map((entry) => (
                    <li key={entry.name}>
                      <a className={styles.walletRow} href={entry.href} target="_blank" rel="noreferrer" aria-label={`Install ${entry.name}`}>
                        <span className={styles.walletBlank} aria-hidden="true"><Icon name="wallet" /></span>
                        <span className={styles.walletName}>{entry.name}</span>
                        <span className={styles.walletBadge} data-kind="install">Install <Icon name="external" /></span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {handoff ? (
              <div className={styles.phoneWalletHandoff}>
                <a className={styles.walletRow} href={handoff.phantom}><span className={styles.walletName}>{allocation ? "Open Allocation in Phantom" : "Open this page in Phantom"}</span></a>
                <a className={styles.walletRow} href={handoff.solflare}><span className={styles.walletName}>{allocation ? "Open Allocation in Solflare" : "Open this page in Solflare"}</span></a>
                <p>{allocation ? "The plan travels with either link. Quotes and signatures do not." : "Review the action in your wallet before signing."}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {signedOut && step.kind === "choose" ? (
          <>
            <div className={styles.authDivider} role="separator">or</div>
            <section className={styles.connectSection} aria-label="Other ways to sign in">
              <button className={styles.walletRow} type="button" data-kind="provider" onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: `${window.location.pathname}${window.location.search}` })}>
                <span className={styles.walletBlank} aria-hidden="true"><Icon name="google" /></span>
                <span className={styles.walletName}>Continue with Google</span>
              </button>
            </section>
            {/* Email sign-in is reserved here and arrives with PR8. */}
          </>
        ) : null}
      </div>
    </AuthDialog>
  );
}
