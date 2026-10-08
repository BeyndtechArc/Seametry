"use client";

import { useState } from "react";
import { ContinueAction, QuietAction, RouteAction } from "@seametry/ui";
import { authClient } from "@/lib/auth-client";
import { WalletLinkControl } from "./wallet-link-control";
import styles from "../site.module.css";

export function SignInControl({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <>
        <p>Account sign-in is unavailable while its database and provider are being configured.</p>
        <RouteAction href="/app/allocation">Open the Allocation</RouteAction>
      </>
    );
  }
  return <ConfiguredSignInControl />;
}

function ConfiguredSignInControl() {
  const { data: session, isPending } = authClient.useSession();
  const [problem, setProblem] = useState<string>();
  const [working, setWorking] = useState(false);

  if (isPending) return <p role="status">Reading your account session.</p>;

  if (session) {
    return (
      <>
        <p>Signed in as {session.user.email}. Connecting a wallet remains a separate step before signing a transaction.</p>
        <WalletLinkControl />
        <RouteAction href="/app/allocation">Open the Allocation</RouteAction>
        <QuietAction disabled={working} onClick={async () => {
          setWorking(true);
          const result = await authClient.signOut();
          setWorking(false);
          if (result.error) setProblem(result.error.message ?? "Could not end this session.");
        }}>Sign out</QuietAction>
        <QuietAction disabled={working} onClick={async () => {
          if (!window.confirm("Delete this account and its sign-in methods? This will not move any on-chain assets.")) return;
          setWorking(true);
          const result = await authClient.deleteUser();
          setWorking(false);
          if (result.error) setProblem(result.error.message ?? "Could not delete this account. Sign in again and retry.");
        }}>Delete account</QuietAction>
        {problem ? <p role="alert" className={styles.authProblem}>{problem}</p> : null}
      </>
    );
  }

  return (
    <>
      <ContinueAction disabled={working} onClick={async () => {
        setWorking(true);
        setProblem(undefined);
        const result = await authClient.signIn.social({ provider: "google", callbackURL: "/sign-in" });
        if (result.error) {
          setProblem(result.error.message ?? "Google sign-in did not complete.");
          setWorking(false);
        }
      }}>Continue with Google</ContinueAction>
      <p>Signing in saves an account session. Connect an external wallet separately when you want to act from its address.</p>
      {problem ? <p role="alert" className={styles.authProblem}>{problem}</p> : null}
      <RouteAction href="/app/allocation">Explore without an account</RouteAction>
    </>
  );
}
