"use client";

import { useCallback, useMemo, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { TextAction } from "@seametry/ui";
import { fetchClaim, hallProgram } from "@/lib/hall/program";
import { claimPda, hallTokenAccount, ownerTokenAccount } from "@/lib/hall/pda";
import { decodeAlloy, requiredIn, type DecodedAlloy } from "@/lib/hall/decode";
import { SHARE_DECIMALS } from "@/lib/hall/constants";

interface Founded {
  allocId: string;
  alloy: string;
  shareMint: string;
  stocks: { mint: string; label: string; holderAccount: string }[];
  signatures: Record<string, string>;
}

interface StepLog {
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

  const program = useMemo(() => (provider ? hallProgram(provider) : null), [provider]);

  const refreshAlloy = useCallback(async () => {
    if (!founded) return;
    const info = await connection.getAccountInfo(new PublicKey(founded.alloy), "confirmed");
    if (info) setAlloyState(decodeAlloy(info.data));
  }, [connection, founded]);

  const refreshClaim = useCallback(async () => {
    if (!founded || !publicKey || !program) return;
    const pda = claimPda(new PublicKey(founded.alloy), publicKey);
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
      pushLog({ action: "Found a fresh alloy and fund this wallet with mock stock", result: "ok", detail: `Alloy ${body.alloy}`, signature: body.signatures.initializeAlloy });
      const info = await connection.getAccountInfo(new PublicKey(body.alloy), "confirmed");
      if (info) setAlloyState(decodeAlloy(info.data));
    } catch (error) {
      pushLog({ action: "Found a fresh alloy", result: "refused", detail: reasonFrom(error) });
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
      pushLog({ action: `Strike ${Number(STRIKE_SHARES) / 10 ** SHARE_DECIMALS} shares`, result: "ok", detail: "Required inputs taken exactly, no more.", signature: sig });
      await refreshAlloy();
    } catch (error) {
      pushLog({ action: "Strike shares", result: "refused", detail: reasonFrom(error) });
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
      pushLog({ action: `The Office freezes the Hall's account for ${founded.stocks[0].label}`, result: "ok", detail: "create will refuse this leg; redeem is unaffected.", signature: body.signature });
    } catch (error) {
      pushLog({ action: "The Office freezes a constituent", result: "refused", detail: reasonFrom(error) });
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
      const claim = claimPda(alloy, publicKey);
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
      pushLog({ action: "Melt: burn shares, credit a claim for every leg", result: "ok", detail: "No constituent mint and no constituent token program is among these accounts. That is what makes this impossible for an issuer to block.", signature: sig });
      await refreshAlloy();
      await refreshClaim();
    } catch (error) {
      pushLog({ action: "Melt", result: "refused", detail: reasonFrom(error) });
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
        const claim = claimPda(alloy, publicKey);
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
        pushLog({ action: `Withdraw leg ${label}`, result: "ok", detail: "Delivered.", signature: sig });
        await refreshAlloy();
        await refreshClaim();
      } catch (error) {
        pushLog({ action: `Withdraw leg ${label}`, result: "refused", detail: reasonFrom(error) + " The claim stays exactly as it was until the issuer releases it." });
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
      pushLog({ action: `The Office releases the Hall's account for ${founded.stocks[0].label}`, result: "ok", detail: "The claim can now be withdrawn.", signature: body.signature });
    } catch (error) {
      pushLog({ action: "The Office releases a constituent", result: "refused", detail: reasonFrom(error) });
    } finally {
      setBusy(null);
    }
  }, [founded]);

  return (
    <div className="hall-demo">
      <p className="devnet-line">Devnet Hall. Key still in hand. Mock issuers, invented tokens: nothing here is a market fact.</p>

      {!connected && (
        <div className="card">
          <p className="tight">Use the wallet control in the header to enter the demonstration. The wallet needs devnet SOL for the claim account&apos;s rent.</p>
        </div>
      )}

      {connected && publicKey && (
        <div className="card">
          <p className="tight">Holder <code className="addr">{publicKey.toBase58()}</code></p>
          {!founded && (
            <div className="tray">
              <button className="key" disabled={founding} onClick={doFound}>
                {founding ? "Founding an alloy…" : "Found an alloy and fund this wallet"}
              </button>
            </div>
          )}
        </div>
      )}

      {founded && alloyState && (
        <div className="card">
          <h3 className="lead">The alloy</h3>
          <p className="tight addr">{founded.alloy}</p>
          <div className="record-actions">
            <TextAction href={`/app/alloys/${encodeURIComponent(founded.alloy)}`}>Inspect this Alloy live</TextAction>
            <a
              href={`https://explorer.solana.com/address/${founded.alloy}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the account on Solana
            </a>
          </div>
          <dl className="row">
            <dt>Supply</dt>
            <dd className="n">{alloyState.supply.toString()}</dd>
            {alloyState.legs.map((leg, i) => (
              <>
                <dt key={`ledger-label-${i}`}>{founded.stocks[i]?.label ?? i} ledger</dt>
                <dd key={`ledger-value-${i}`} className="n">{leg.ledger.toString()}</dd>
              </>
            ))}
          </dl>
          <p className="tight">The share mint has no freeze authority, no permanent delegate, no pause, no hook. Mint authority is the alloy&apos;s own address, and only Strike can use it.</p>

          <div className="tray">
            <button className="key" disabled={busy !== null} onClick={doStrike}>
              {busy === "strike" ? "Striking…" : "Strike shares"}
            </button>
            <button className="quiet" disabled={busy !== null} onClick={doFreeze}>
              {busy === "freeze" ? "Freezing…" : `The Office freezes ${founded.stocks[0]?.label}`}
            </button>
            <button className="key" disabled={busy !== null} onClick={doRedeem}>
              {busy === "redeem" ? "Melting…" : "Melt shares"}
            </button>
            <button className="quiet" disabled={busy !== null} onClick={doThaw}>
              {busy === "thaw" ? "Releasing…" : `The Office releases ${founded.stocks[0]?.label}`}
            </button>
          </div>

          {claimUnits && (
            <div className="tray">
              {claimUnits.map((units, i) =>
                units > 0n ? (
                  <button key={i} className="key" disabled={busy !== null} onClick={() => doWithdraw(i)}>
                    {busy === `withdraw-${i}` ? "Withdrawing…" : `Withdraw ${founded.stocks[i].label} (${units.toString()})`}
                  </button>
                ) : null
              )}
            </div>
          )}
        </div>
      )}

      {log.length > 0 && (
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
      )}
    </div>
  );
}
