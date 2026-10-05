"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { TextAction } from "@seametry/ui";
import { MechanismDrawing } from "@seametry/ui/plates";
import { formatAmount } from "@/lib/amount";
import { fetchClaim, hallProgram } from "@/lib/hall/program";
import { claimPda, hallTokenAccount, ownerTokenAccount } from "@/lib/hall/pda";
import { decodeAlloy, requiredIn, type DecodedAlloy } from "@/lib/hall/decode";
import { DEMO_HALL_PROGRAM_ID, SHARE_DECIMALS } from "@/lib/hall/constants";

interface Founded {
  allocId: string;
  alloy: string;
  shareMint: string;
  stocks: { mint: string; label: string; holderAccount: string }[];
  signatures: Record<string, string>;
}

type StepId = "found" | "strike" | "freeze" | "melt" | "withdraw" | "release";

interface StepLog {
  step: StepId;
  action: string;
  result: "ok" | "refused";
  detail: string;
  signature?: string;
}

const STRIKE_SHARES = 100_000n; // 0.1 share at SHARE_DECIMALS = 6, small on purpose: a demo, not a real position.

function short(sig: string) {
  return sig.length > 20 ? `${sig.slice(0, 8)}…${sig.slice(-8)}` : sig;
}

function explorerLink(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

/** Reads a message worth showing a visitor out of whatever the RPC or the program rejected the transaction with. */
function reasonFrom(error: unknown): string {
  if (error && typeof error === "object") {
    const anyErr = error as { message?: string; logs?: string[] };
    const logs = anyErr.logs?.filter((l) => l.includes("Error") || l.includes("failed")).join(" | ");
    if (logs) return logs;
    if (anyErr.message) return anyErr.message;
  }
  return String(error);
}

export function HallDemoFlow() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [founding, setFounding] = useState(false);
  const [founded, setFounded] = useState<Founded | null>(null);
  const [alloyState, setAlloyState] = useState<DecodedAlloy | null>(null);
  const [log, setLog] = useState<StepLog[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [claimUnits, setClaimUnits] = useState<bigint[] | null>(null);

  const provider = useMemo(() => {
    if (!anchorWallet) return null;
    return new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  }, [connection, anchorWallet]);

  const program = useMemo(() => (provider ? hallProgram(provider, DEMO_HALL_PROGRAM_ID) : null), [provider]);

  const refreshAlloy = useCallback(async () => {
    if (!founded) return;
    const info = await connection.getAccountInfo(new PublicKey(founded.alloy), "confirmed");
    if (info) setAlloyState(decodeAlloy(info.data));
  }, [connection, founded]);

  const refreshClaim = useCallback(async () => {
    if (!founded || !publicKey || !program) return;
    const pda = claimPda(DEMO_HALL_PROGRAM_ID, new PublicKey(founded.alloy), publicKey);
    const claim = await fetchClaim(program, pda);
    if (claim) {
      setClaimUnits(claim.entries.slice(0, founded.stocks.length).map((e) => BigInt(e.units.toString())));
    } else {
      setClaimUnits(null);
    }
  }, [founded, publicKey, program]);

  const pushLog = (entry: StepLog) => setLog((prev) => [...prev, entry]);

  const doFound = useCallback(async () => {
    if (!publicKey) return;
    setFounding(true);
    try {
      const res = await fetch("/api/hall-demo/found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder: publicKey.toBase58() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "founding failed");
      setFounded(body);
      pushLog({ step: "found", action: "Found a fresh alloy and fund this wallet with mock stock", result: "ok", detail: `Alloy ${body.alloy}`, signature: body.signatures.initializeAlloy });
      const info = await connection.getAccountInfo(new PublicKey(body.alloy), "confirmed");
      if (info) setAlloyState(decodeAlloy(info.data));
    } catch (error) {
      pushLog({ step: "found", action: "Found a fresh alloy", result: "refused", detail: reasonFrom(error) });
    } finally {
      setFounding(false);
    }
  }, [publicKey, connection]);

  const doStrike = useCallback(async () => {
    if (!founded || !program || !publicKey || !alloyState) return;
    setBusy("strike");
    try {
      const alloy = new PublicKey(founded.alloy);
      const shareMint = new PublicKey(founded.shareMint);
      const callerShares = ownerTokenAccount(publicKey, shareMint);
      const maximums = alloyState.legs.map((leg) => new BN(requiredIn(leg.ledger, STRIKE_SHARES, alloyState.supply).toString()));
      const remainingAccounts = founded.stocks.flatMap((s) => {
        const mint = new PublicKey(s.mint);
        return [
          { pubkey: mint, isWritable: false, isSigner: false },
          { pubkey: new PublicKey(s.holderAccount), isWritable: true, isSigner: false },
          { pubkey: hallTokenAccount(alloy, mint), isWritable: true, isSigner: false },
          { pubkey: TOKEN_2022_PROGRAM_ID, isWritable: false, isSigner: false },
        ];
      });
      const sig = await program.methods
        .create(new BN(STRIKE_SHARES.toString()), maximums)
        .accounts({
          caller: publicKey,
          alloy,
          shareMint,
          callerShares,
          shareTokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .rpc({ commitment: "confirmed" });
      pushLog({ step: "strike", action: `Strike ${formatAmount(STRIKE_SHARES, SHARE_DECIMALS)} shares`, result: "ok", detail: "Required inputs taken exactly, no more.", signature: sig });
      await refreshAlloy();
    } catch (error) {
      pushLog({ step: "strike", action: "Strike shares", result: "refused", detail: reasonFrom(error) });
    } finally {
      setBusy(null);
    }
  }, [founded, program, publicKey, alloyState, refreshAlloy]);

  const doFreeze = useCallback(async () => {
    if (!founded) return;
    setBusy("freeze");
    try {
      const res = await fetch("/api/hall-demo/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocId: founded.allocId, alloy: founded.alloy, mint: founded.stocks[0].mint }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "freeze failed");
      pushLog({ step: "freeze", action: `The Office freezes the Hall's account for ${founded.stocks[0].label}`, result: "ok", detail: "create will refuse this leg; redeem is unaffected.", signature: body.signature });
    } catch (error) {
      pushLog({ step: "freeze", action: "The Office freezes a constituent", result: "refused", detail: reasonFrom(error) });
    } finally {
      setBusy(null);
    }
  }, [founded]);

  const doRedeem = useCallback(async () => {
    if (!founded || !program || !publicKey || !alloyState) return;
    setBusy("redeem");
    try {
      const alloy = new PublicKey(founded.alloy);
      const shareMint = new PublicKey(founded.shareMint);
      const callerShares = ownerTokenAccount(publicKey, shareMint);
      const claim = claimPda(DEMO_HALL_PROGRAM_ID, alloy, publicKey);
      const remainingAccounts = founded.stocks.map((s) => ({
        pubkey: hallTokenAccount(alloy, new PublicKey(s.mint)),
        isWritable: false,
        isSigner: false,
      }));
      const sig = await program.methods
        .redeem(new BN(STRIKE_SHARES.toString()))
        .accounts({
          caller: publicKey,
          alloy,
          shareMint,
          callerShares,
          claim,
          shareTokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(remainingAccounts)
        .rpc({ commitment: "confirmed" });
      pushLog({ step: "melt", action: "Melt: burn shares, credit a claim for every leg", result: "ok", detail: "No constituent mint and no constituent token program is among these accounts. That is what makes this impossible for an issuer to block.", signature: sig });
      await refreshAlloy();
      await refreshClaim();
    } catch (error) {
      pushLog({ step: "melt", action: "Melt", result: "refused", detail: reasonFrom(error) });
    } finally {
      setBusy(null);
    }
  }, [founded, program, publicKey, alloyState, refreshAlloy, refreshClaim]);

  const doWithdraw = useCallback(
    async (legIndex: number) => {
      if (!founded || !program || !publicKey || !claimUnits) return;
      const units = claimUnits[legIndex];
      if (!units || units === 0n) return;
      setBusy(`withdraw-${legIndex}`);
      const label = founded.stocks[legIndex].label;
      try {
        const alloy = new PublicKey(founded.alloy);
        const mint = new PublicKey(founded.stocks[legIndex].mint);
        const claim = claimPda(DEMO_HALL_PROGRAM_ID, alloy, publicKey);
        const sig = await program.methods
          .withdraw(legIndex, new BN(units.toString()))
          .accounts({
            owner: publicKey,
            alloy,
            claim,
            mint,
            hallAccount: hallTokenAccount(alloy, mint),
            destination: new PublicKey(founded.stocks[legIndex].holderAccount),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .rpc({ commitment: "confirmed" });
        pushLog({ step: "withdraw", action: `Withdraw leg ${label}`, result: "ok", detail: "Delivered.", signature: sig });
        await refreshAlloy();
        await refreshClaim();
      } catch (error) {
        pushLog({ step: "withdraw", action: `Withdraw leg ${label}`, result: "refused", detail: reasonFrom(error) + " The claim stays exactly as it was until the issuer releases it." });
      } finally {
        setBusy(null);
      }
    },
    [founded, program, publicKey, claimUnits, refreshAlloy, refreshClaim]
  );

  const doThaw = useCallback(async () => {
    if (!founded) return;
    setBusy("thaw");
    try {
      const res = await fetch("/api/hall-demo/thaw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocId: founded.allocId, alloy: founded.alloy, mint: founded.stocks[0].mint }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "thaw failed");
      pushLog({ step: "release", action: `The Office releases the Hall's account for ${founded.stocks[0].label}`, result: "ok", detail: "The claim can now be withdrawn.", signature: body.signature });
    } catch (error) {
      pushLog({ step: "release", action: "The Office releases a constituent", result: "refused", detail: reasonFrom(error) });
    } finally {
      setBusy(null);
    }
  }, [founded]);

  const done = (step: StepId) => log.some((entry) => entry.step === step && entry.result === "ok");
  const frozen = founded?.stocks[0]?.label ?? "constituent A";
  const idle = busy !== null || founding;
  const script: { id: StepId; title: string; sentence: string; action: ReactNode }[] = [
    {
      id: "found",
      title: "Found an Alloy",
      sentence: "A fresh Alloy over two mock stocks, and this wallet funded with both, so every later step is yours to sign.",
      action: (
        <button className="key" disabled={!connected || !!founded || founding} onClick={doFound}>
          {founding ? "Founding an Alloy" : "Found and fund"}
        </button>
      ),
    },
    {
      id: "strike",
      title: "Strike shares",
      sentence: `Deposit exactly the Formula's quantities and receive ${formatAmount(STRIKE_SHARES, SHARE_DECIMALS)} shares.`,
      action: (
        <button className="key" disabled={!founded || idle} onClick={doStrike}>
          {busy === "strike" ? "Striking" : "Strike"}
        </button>
      ),
    },
    {
      id: "freeze",
      title: `The issuer freezes ${frozen}`,
      sentence: "A mock issuer uses its freeze authority on the Hall's account for one constituent, as a real issuer could.",
      action: (
        <button className="quiet" disabled={!founded || idle} onClick={doFreeze}>
          {busy === "freeze" ? "Freezing" : `Freeze ${frozen}`}
        </button>
      ),
    },
    {
      id: "melt",
      title: "Melt anyway",
      sentence: "Burn the shares for a claim on every leg. No constituent account is touched, so the freeze cannot stop it.",
      action: (
        <button className="key" disabled={!founded || idle} onClick={doRedeem}>
          {busy === "redeem" ? "Melting" : "Melt"}
        </button>
      ),
    },
    {
      id: "withdraw",
      title: "Withdraw each leg",
      sentence: `The free leg delivers, while ${frozen} is refused and stays a claim, unchanged, until it is released.`,
      action: claimUnits?.some((units) => units > 0n) && founded ? (
        <span className="step-actions">
          {claimUnits.map((units, i) =>
            units > 0n ? (
              <button key={founded.stocks[i].mint} className="key" disabled={idle} onClick={() => doWithdraw(i)}>
                {busy === `withdraw-${i}` ? "Withdrawing" : `Withdraw ${founded.stocks[i].label}`}
              </button>
            ) : null,
          )}
        </span>
      ) : (
        <button className="key" disabled>Withdraw</button>
      ),
    },
    {
      id: "release",
      title: `The issuer releases ${frozen}`,
      sentence: "The freeze lifts and the held claim withdraws in full.",
      action: (
        <button className="quiet" disabled={!founded || idle} onClick={doThaw}>
          {busy === "thaw" ? "Releasing" : `Release ${frozen}`}
        </button>
      ),
    },
  ];
  const next = connected ? script.find((step) => !done(step.id))?.id : undefined;

  return (
    <div className="hall-demo">
      <p className="devnet-line">Devnet Hall. Key still in hand. Mock issuers, invented tokens: nothing here is a market fact.</p>

      <div className="demo-layout">
        <ol className="demo-script" aria-label="Demonstration steps">
          {script.map((step, index) => {
            const state = done(step.id) ? "done" : step.id === next ? "next" : "waiting";
            return (
              <li key={step.id} data-state={state}>
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="step-copy">
                  <h3>{step.title}</h3>
                  <p>{step.sentence}</p>
                </div>
                <div className="step-act">
                  <span className="step-state">{state === "done" ? "Done" : state === "next" ? "Next" : "Waiting"}</span>
                  {step.action}
                </div>
              </li>
            );
          })}
        </ol>

        <aside className="demo-side">
          {!connected ? (
            <div className="card">
              <h3 className="lead">Log in to begin</h3>
              <p className="tight">Use Log in in the header with a devnet wallet. It needs a little devnet SOL for the claim account&apos;s rent; everything else is funded for you.</p>
              <div className="demo-drawing"><MechanismDrawing kind="claims" /></div>
            </div>
          ) : publicKey ? (
            <div className="card">
              <h3 className="lead">Holder</h3>
              <p className="tight addr">{publicKey.toBase58()}</p>
            </div>
          ) : null}

          {founded && alloyState ? (
            <div className="card">
              <h3 className="lead">The Alloy</h3>
              <p className="tight addr">{founded.alloy}</p>
              <dl className="row">
                <dt>Supply</dt>
                <dd className="n">{formatAmount(alloyState.supply, SHARE_DECIMALS)}</dd>
                {alloyState.legs.flatMap((leg, i) => [
                  <dt key={`label-${i}`}>{founded.stocks[i]?.label ?? i} in the Hall</dt>,
                  <dd key={`value-${i}`} className="n">{leg.ledger.toString()} atoms</dd>,
                ])}
              </dl>
              <p className="tight">The share mint has no freeze authority, no permanent delegate, no pause, no hook. Only Strike can mint.</p>
              <div className="record-actions">
                <TextAction href={`https://explorer.solana.com/address/${founded.alloy}?cluster=devnet`} target="_blank" rel="noopener noreferrer">Open on Solana</TextAction>
              </div>
            </div>
          ) : null}

          {log.length > 0 ? (
            <div className="card">
              <h3 className="lead">What happened</h3>
              {log
                .slice()
                .reverse()
                .map((entry, i) => (
                  <div className="sentence" key={i}>
                    <span>
                      <span className={`stamp ${entry.result === "ok" ? "allow" : "warn"}`}>{entry.result}</span> {entry.action}
                      <br />
                      {entry.detail}
                      {entry.signature && (
                        <>
                          {" "}
                          <a href={explorerLink(entry.signature)} target="_blank" rel="noopener noreferrer">
                            <code>{short(entry.signature)}</code>
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
