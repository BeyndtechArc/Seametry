"use client";

import { useEffect, useState } from "react";
import { Connection } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { Digest, Key, TextAction } from "@seametry/ui";
import { buildFoundingTransaction, type FoundingIdentity } from "@/lib/compose/founding-transaction";
import type { PreparedFounding } from "@/lib/compose/founding-prepare";
import { metadataPath, metadataUri } from "@/lib/compose/identity";
import { DEVNET_RPC_ENDPOINT, REGISTER_HALL_PROGRAM_ID } from "@/lib/hall/constants";
import { hallProgram } from "@/lib/hall/program";
import styles from "./compose.module.css";

type Phase =
  | { step: "idle" }
  | { step: "preparing" }
  | { step: "signing" }
  | { step: "confirming"; signature: string }
  | { step: "founded"; signature: string; prepared: PreparedFounding }
  | { step: "refused"; reason: string };

/** Whether the metadata this name would be founded with is published, read once per name. */
function usePublished(name: string): boolean | undefined {
  const [answer, setAnswer] = useState<{ name: string; published: boolean }>();
  useEffect(() => {
    let current = true;
    fetch(metadataPath(name), { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => undefined) : undefined;
        if (current) setAnswer({ name, published: Boolean(body && body.name === name) });
      })
      .catch(() => current && setAnswer({ name, published: false }));
    return () => {
      current = false;
    };
  }, [name]);
  return answer?.name === name ? answer.published : undefined;
}

const LOOKUP_TABLE_ATTEMPTS = 5;

/** A lookup table answers from the slot after it was extended, so the first read can be a moment early. */
async function buildWhenReady(connection: Connection, provider: AnchorProvider, prepared: PreparedFounding, identity: FoundingIdentity) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await buildFoundingTransaction(connection, hallProgram(provider, REGISTER_HALL_PROGRAM_ID), prepared, identity);
    } catch (error) {
      if (attempt >= LOOKUP_TABLE_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

export function FoundingPanel({ legs, name, symbol }: { legs: { mint: string; atomsPerShare: bigint }[]; name: string; symbol: string }) {
  const { connected } = useWallet();
  const wallet = useAnchorWallet();
  const published = usePublished(name);
  const [phase, setPhase] = useState<Phase>({ step: "idle" });

  const found = async () => {
    if (!wallet) return;
    try {
      setPhase({ step: "preparing" });
      const response = await fetch("/api/compose/found", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sponsor: wallet.publicKey.toBase58(), name, symbol, legs: legs.map((leg) => ({ mint: leg.mint, atomsPerShare: leg.atomsPerShare.toString() })) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      const { prepared, identity } = body as { prepared: PreparedFounding; identity: FoundingIdentity };

      setPhase({ step: "signing" });
      const connection = new Connection(DEVNET_RPC_ENDPOINT, "confirmed");
      const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
      const transaction = await buildWhenReady(connection, provider, prepared, identity);
      const signed = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize());

      setPhase({ step: "confirming", signature });
      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) throw new Error(`The Hall refused the founding: ${JSON.stringify(confirmation.value.err)}`);
      setPhase({ step: "founded", signature, prepared });
    } catch (error) {
      setPhase({ step: "refused", reason: error instanceof Error ? error.message : "The founding did not complete." });
    }
  };

  if (phase.step === "founded") {
    return (
      <section className={styles.founding} aria-labelledby="founded-heading" data-testid="founding">
        <span className={styles.label}>Founded on devnet</span>
        <h3 id="founded-heading">{name} is founded</h3>
        <Digest value={phase.prepared.alloy} />
        <p className={styles.note}>Its Formula, name, symbol and URI are fixed. One share is locked as the genesis, forever.</p>
        <TextAction href={`/app/alloys/${phase.prepared.alloy}`}>Open the Alloy record</TextAction>
        <TextAction href={`https://explorer.solana.com/tx/${phase.signature}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Open the founding on Solana</TextAction>
      </section>
    );
  }

  const busy = phase.step === "preparing" || phase.step === "signing" || phase.step === "confirming";
  const reason = !connected
    ? "Log in with a devnet wallet: it signs as the sponsor."
    : published === false
      ? `No metadata is published at ${metadataPath(name)}, so this name has no URI to found with.`
      : undefined;

  return (
    <section className={styles.founding} aria-labelledby="found-heading" data-testid="founding">
      <span className={styles.label}>Found on devnet</span>
      <h3 id="found-heading">Found {name}</h3>
      <dl className={styles.terms}>
        <div><dt>Hall</dt><dd>The register&apos;s devnet Hall. Key still in hand.</dd></div>
        <div><dt>Sponsor</dt><dd>Your connected wallet, which signs</dd></div>
        <div><dt>Constituents</dt><dd>Devnet stand-ins carrying each stock&apos;s token settings</dd></div>
        <div><dt>Genesis</dt><dd>One share, locked forever</dd></div>
        <div><dt>URI</dt><dd>{metadataUri(name)}</dd></div>
      </dl>
      <p className={styles.note}>The Formula, name, symbol and URI cannot change after this.</p>
      <Key
        type="button"
        onClick={() => void found()}
        disabled={Boolean(reason) || published === undefined}
        disabledReason={reason}
        busy={busy}
        busyLabel={phase.step === "preparing" ? "Preparing stand-ins" : phase.step === "signing" ? "Waiting for your signature" : "Confirming on devnet"}
      >
        Found on devnet
      </Key>
      {phase.step === "refused" ? <p className={styles.problem} role="alert">{phase.reason}</p> : null}
    </section>
  );
}
