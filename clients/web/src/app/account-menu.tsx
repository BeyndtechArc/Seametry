"use client";

import { useCallback, useEffect, useState } from "react";
import { QuietAction } from "@seametry/ui";
import type { AccountUser } from "@/lib/account-session";
import styles from "./site.module.css";

export type LinkedWallet = { address: string; verified_at: string };

const sessionChanged = "seametry:account-session";
// A wallet-only account's placeholder (server/auth/src/solana-sign-in.mjs)
// is not an email the holder gave, so it is never shown as one.
const placeholderDomain = "@wallet.seametry.invalid";

export function realEmail(user: AccountUser) {
  return user.email && !user.email.toLowerCase().endsWith(placeholderDomain) ? user.email : undefined;
}

/** Re-reads whenever the session changes here, so a link or sign-out shows at once. */
function useSessionRead<T>(enabled: boolean, read: () => Promise<T>) {
  const [answer, setAnswer] = useState<{ round: number; value: T }>();
  const [round, setRound] = useState(0);
  const again = useCallback(() => setRound((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener(sessionChanged, again);
    return () => window.removeEventListener(sessionChanged, again);
  }, [again]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    read().then((value) => { if (current) setAnswer({ round, value }); }, () => {});
    return () => { current = false; };
    // read is a fixed request per caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, round]);
  return enabled ? answer?.value : undefined;
}

async function json(path: string) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.json();
}

/** The wallets this account signed for (GET /api/account/wallets); undefined while reading. */
export function useLinkedWallets(signedIn: boolean) {
  return useSessionRead<LinkedWallet[]>(signedIn, async () => {
    const body = await json("/api/account/wallets");
    return Array.isArray(body?.wallets) ? body.wallets.filter((wallet: LinkedWallet) => typeof wallet?.address === "string") : [];
  });
}

const methodNames: [string, string][] = [["solana", "a wallet"], ["google", "Google"], ["credential", "email"]];

/** How this account signs in, from its Better Auth identities, in a fixed order. */
export function useSignInMethods(signedIn: boolean) {
  return useSessionRead<string[]>(signedIn, async () => {
    const body = await json("/api/auth/list-accounts");
    const providers = new Set(Array.isArray(body) ? body.map((entry: { providerId?: unknown }) => entry?.providerId) : []);
    return methodNames.filter(([provider]) => providers.has(provider)).map(([, name]) => name);
  });
}

export function methodsSentence(methods: string[] | undefined) {
  if (!methods) return "Reading how this account signs in.";
  if (methods.length === 0) return "No sign-in method is recorded for this account.";
  return `Signed in with ${methods.length === 1 ? methods[0] : `${methods.slice(0, -1).join(", ")} and ${methods.at(-1)}`}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The account half of the header menu: who is signed in, how, the wallets the
 * account linked, and the way to link another or sign out. Deleting the
 * account stays on /sign-in.
 */
export function AccountMenu({ user, wallets, methods, onLink, onSignOut, working }: {
  user: AccountUser;
  wallets: LinkedWallet[] | undefined;
  methods: string[] | undefined;
  onLink: () => void;
  onSignOut: () => void;
  working: boolean;
}) {
  const [copied, setCopied] = useState<string>();
  const email = realEmail(user);
  return (
    <section className={styles.accountMenu} data-testid="account-menu" aria-label="Account">
      <header>
        <b>{email ?? "No email yet"}</b>
        <span>Account {user.id.slice(0, 8)}</span>
      </header>
      <p>{methodsSentence(methods)}</p>
      <b>Linked wallets</b>
      {wallets === undefined ? <p role="status">Reading linked wallets.</p> : wallets.length === 0 ? <p>No wallet linked yet.</p> : (
        <ul>
          {wallets.map((wallet) => (
            <li key={wallet.address}>
              <code>{wallet.address}</code>
              <QuietAction aria-label={`Copy ${wallet.address}`} onClick={async () => setCopied((await copyText(wallet.address)) ? wallet.address : undefined)}>Copy</QuietAction>
            </li>
          ))}
        </ul>
      )}
      {copied ? <p role="status">Address copied</p> : null}
      <div className={styles.connectActions}>
        <QuietAction icon="wallet" disabled={working} onClick={onLink}>{wallets?.length ? "Link another wallet" : "Link a wallet"}</QuietAction>
        <QuietAction disabled={working} onClick={onSignOut}>Sign out</QuietAction>
      </div>
    </section>
  );
}
