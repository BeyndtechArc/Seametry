"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { ContinueAction, QuietAction } from "@seametry/ui";
import { ModalSheet } from "@seametry/ui/modal-sheet";
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
export function ConnectModal({ open, onClose, onConnected, session }: { open: boolean; onClose: () => void; onConnected?: () => void; session: AccountSession & { refresh: () => void } }) {
  const { wallets, wallet, connected, select, connect } = useWallet();
  const { failure, clear } = useWalletFailure();
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
      if (signedOut && (candidate.signIn || candidate.signMessage)) void signInWith(step.name, candidate);
      else finish();
    };
    const refused = (error: { message?: string }) => {
      setStep({ kind: "problem", name: step.name, message: `Connection was not completed: ${error.message || failure || "the wallet refused."}`, retry: true });
    };
    adapter.on("connect", connectedNow);
    adapter.on("error", refused);
    return () => {
      adapter.off("connect", connectedNow);
      adapter.off("error", refused);
    };
    // The handlers read the step and session at the moment they fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, wallets, signedOut]);

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

  return (
    <ModalSheet open={open} onClose={close} title="Connect a wallet" register={signedOut ? "Sign in" : "Wallet"} closeLabel="Close">
      <div ref={body} className={styles.connectModal} data-testid="connect-modal" data-step={step.kind}>
        {session.state === "signed-in" ? <p>You are signed in. Connecting a wallet shows its balances here; it asks for no signature.</p> : null}
        {signedOut ? <p>Choose a wallet. Signing in with it signs a message, never a transaction.</p> : null}

        {step.kind === "connecting" ? <p role="status">Approve the connection in {step.name}.</p> : null}
        {step.kind === "signing" ? (
          <p role="status">{step.phase === "wallet" ? `Check ${step.name} to sign in.` : "Confirming the signature."}</p>
        ) : null}
        {step.kind === "problem" ? (
          <div className={styles.connectProblem}>
            <p role="alert">{step.message}</p>
            <div className={styles.connectActions}>
              {step.retry ? <ContinueAction onClick={() => (connected && wallet ? void signInWith(step.name, signing(wallet.adapter)) : choose(step.name))}>Try again</ContinueAction> : null}
              {connected ? <QuietAction onClick={finish}>Continue without signing in</QuietAction> : <QuietAction onClick={() => setStep({ kind: "choose" })}>Choose another wallet</QuietAction>}
            </div>
          </div>
        ) : null}

        {step.kind === "choose" || step.kind === "connecting" ? (
          <section className={styles.connectSection} aria-label="Wallets">
            {!hydrated ? (
              <p role="status">Looking for wallets in this browser.</p>
            ) : ordered.length === 0 ? (
              <>
                <p>No signing wallet is available in this browser. Install one, then reload this page.</p>
                {installLinks.map((link) => (
                  <a key={link.name} className={styles.walletChoice} href={link.href} target="_blank" rel="noreferrer">
                    <span />
                    <span>Install {link.name}</span>
                  </a>
                ))}
              </>
            ) : (
              ordered.map((entry) => (
                <button className={styles.walletChoice} type="button" key={entry.adapter.name} disabled={step.kind === "connecting"} onClick={() => choose(entry.adapter.name)}>
                  <Image className={styles.walletBrand} src={entry.adapter.icon} width={24} height={24} alt="" unoptimized />
                  <span>Connect {entry.adapter.name}</span>
                </button>
              ))
            )}
            {handoff ? (
              <div className={styles.phoneWalletHandoff}>
                <a className={styles.walletChoice} href={handoff.phantom}>{allocation ? "Open Allocation in Phantom" : "Open this page in Phantom"}</a>
                <a className={styles.walletChoice} href={handoff.solflare}>{allocation ? "Open Allocation in Solflare" : "Open this page in Solflare"}</a>
                <p>{allocation ? "The plan travels with either link. Quotes and signatures do not." : "Review the action in your wallet before signing."}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {signedOut && step.kind === "choose" ? (
          <section className={styles.connectSection} aria-label="Other ways to sign in">
            <QuietAction onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: `${window.location.pathname}${window.location.search}` })}>Continue with Google</QuietAction>
          </section>
        ) : null}
      </div>
    </ModalSheet>
  );
}
