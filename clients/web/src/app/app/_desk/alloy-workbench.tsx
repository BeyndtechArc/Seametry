"use client";

import Link from "next/link";
import { Digest, Figure, LotMark, RouteAction, Rule, Stamp, type EvidenceState } from "@seametry/ui";
import type {
  Alloy,
  AlloyRecordResponse,
  AlloyRegisterResponse,
  CostRow,
  Meta,
  TerminalProblem,
} from "@/lib/terminal-contract";
import { alloyIdentity, legIdentity } from "@/lib/alloys/records";
import { AlloyArtwork } from "./alloy-artwork";
import { formatAmount } from "@/lib/amount";
import { ONE_SHARE_ATOMS, SHARE_DECIMALS } from "@/lib/hall/constants";
import { NetworkBadge, PageHeader } from "../_shell/page-header";
import { AlloyActions } from "./alloy-actions";
import { useTerminalResource } from "./workbench";
import styles from "./desk.module.css";

function observedAge(observedAt: string) {
  const elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 1000));
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function evidenceState(meta: Meta): EvidenceState {
  if (meta.completeness === "partial") return "unverified";
  return "verified";
}

function hallSource(meta: Meta) {
  return `Solana ${meta.cluster ?? "cluster unavailable"} via Gateway`;
}

function heldCount(alloy: Alloy) {
  return alloy.legs.filter((leg) => leg.held_back).length;
}

function AlloyLoading({ record = false }: { record?: boolean }) {
  return (
    <section className={styles.loading} role="status">
      <span>{record ? "Reading Alloy account and stated terms" : "Reading the Hall register"}</span>
      <Rule label="Waiting for the Gateway" />
    </section>
  );
}

function AlloyBoundary({ problem }: { problem: TerminalProblem }) {
  return (
    <section className={styles.boundary} role="status">
      <div className={styles.boundaryTitle}>
        <span>Hall boundary</span>
        <h2>{problem.title}</h2>
      </div>
      <div className={styles.boundaryCopy}>
        <p>{problem.detail}</p>
        <code>HTTP {problem.status}</code>
      </div>
      <div className={styles.boundaryActions}>
        <RouteAction href="/how-it-works">Read how the Hall works</RouteAction>
      </div>
    </section>
  );
}

function EmptyHall({ meta }: { meta: Meta }) {
  return (
    <section className={styles.boundary} role="status">
      <div className={styles.boundaryTitle}>
        <span>Hall register</span>
        <h2>No Alloy founded yet</h2>
      </div>
      <div className={styles.boundaryCopy}>
        <p>The {meta.cluster ?? "configured"} Hall answered with an empty register. An Alloy is founded from Compose: choose its constituents, weight and name it, and sign as its sponsor.</p>
        <code>{meta.completeness}</code>
      </div>
      <div className={styles.boundaryActions}>
        <RouteAction href="/app/compose">Compose a Formula</RouteAction>
      </div>
    </section>
  );
}

export function AlloyRegister() {
  const { value, problem, loading } = useTerminalResource<AlloyRegisterResponse>("/api/terminal/alloys");

  return (
    <div className={styles.alloyRegister}>
      <PageHeader group="Hall" title="Alloys" network="Devnet" info={<p>Every Alloy account the Hall holds, read live, with its supply and any leg held back.</p>} />

      {loading ? <AlloyLoading /> : null}
      {problem ? <AlloyBoundary problem={problem} /> : null}
      {value && value.data.length === 0 ? <EmptyHall meta={value.meta} /> : null}
      {value && value.data.length > 0 ? (
        <section className={styles.registerSection} aria-labelledby="alloy-register-heading">
          <header className={styles.sectionHeading}>
            <span>{value.meta.cluster ?? "Cluster unavailable"}</span>
            <h2 id="alloy-register-heading">Recorded Alloys</h2>
            <p>Observed {observedAge(value.meta.as_of)} ago. Evidence state: {value.meta.completeness}.</p>
          </header>
          <ol className={styles.alloyRows}>
            {value.data.map((alloy) => {
              const held = heldCount(alloy);
              const identity = alloyIdentity(alloy);
              return (
                <li key={alloy.address} aria-label={identity.title}>
                  <Link className={styles.alloyRowIdentity} href={`/app/alloys/${encodeURIComponent(alloy.address)}`}>
                    <AlloyArtwork alloy={alloy} identity={identity} className={styles.alloyArtworkRow} size={64} alt="" />
                    <div>
                      <b>{identity.title}</b>
                      {identity.symbol ? <span>{identity.symbol}</span> : null}
                      <Digest value={alloy.address} />
                    </div>
                  </Link>
                  <div className={`${styles.alloyRowCell} ${styles.alloyRowHolds}`}>
                    <small>Holds</small>
                    <span className={styles.lotStack}>
                      {alloy.legs.map((leg, index) => {
                        const lot = legIdentity(alloy, leg.mint);
                        return <LotMark key={leg.mint} symbol={lot.symbol ?? String(index + 1)} src={lot.logo} />;
                      })}
                    </span>
                    <span>{alloy.legs.length} {alloy.legs.length === 1 ? "stock" : "stocks"}</span>
                  </div>
                  <div className={styles.alloyRowCell}>
                    <small>Supply</small>
                    <span>{formatAmount(alloy.supply, SHARE_DECIMALS)} shares</span>
                  </div>
                  <div className={styles.alloyRowCell}>
                    <small>Delivery</small>
                    <span>{held === 0 ? "Every leg delivering" : `${held} held as a Claim`}</span>
                  </div>
                  <Link className={styles.alloyRowOpen} href={`/app/alloys/${encodeURIComponent(alloy.address)}`}>Open Alloy</Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function amountFor(row: CostRow, mint: string) {
  return row.legs.find((leg) => leg.stock === mint);
}

export function AlloyRecord({ address }: { address: string }) {
  const { value, problem, loading, reload } = useTerminalResource<AlloyRecordResponse>(
    `/api/terminal/alloys/${encodeURIComponent(address)}`,
  );
  const alloy = value?.alloy.data;
  const meta = value?.alloy.meta;
  const identity = alloy ? alloyIdentity(alloy) : undefined;

  return (
    <>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/app/alloys">Alloys</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{identity ? identity.title : "Alloy record"}</span>
      </nav>
      {loading ? <AlloyLoading record /> : null}
      {problem ? <AlloyBoundary problem={problem} /> : null}
      {value && alloy && meta && identity ? (
        <>
          <section className={styles.recordHead} aria-labelledby="live-alloy-title">
            <div className={styles.recordIdentity}>
              <header>
                <span className={styles.recordLabel}>Alloy {alloy.id}</span>
                <NetworkBadge network="Devnet" />
              </header>
              <div className={styles.alloyTitle}>
                <AlloyArtwork alloy={alloy} identity={identity} className={styles.alloyArtwork} size={96} alt={`${identity.title} artwork`} />
                <div>
                  <h1 id="live-alloy-title">{identity.title}</h1>
                  {identity.symbol ? <span className={styles.alloySymbol}>{identity.symbol}</span> : null}
                </div>
              </div>
              <p className={styles.alloySentence}>
                One share holds {alloy.legs.length} {alloy.legs.length === 1 ? "stock" : "stocks"} in fixed amounts. Anyone can Strike a share by depositing them, or Melt one to take them back.
              </p>
              {identity.source !== "none" ? (
                <small className={styles.alloySource}>Name read from the {identity.source}{identity.source === "share mint" ? ", fixed at founding" : ", generated from devnet"}.</small>
              ) : null}
            </div>
          </section>

          <section className={styles.holdings} aria-labelledby="holdings-heading">
            <h2 id="holdings-heading">One share holds</h2>
            <ol>
              {alloy.legs.map((leg, index) => {
                const lot = legIdentity(alloy, leg.mint);
                const strike = amountFor(value.strike.data, leg.mint);
                return (
                  <li key={leg.mint} data-held={leg.held_back || undefined}>
                    <LotMark symbol={lot.symbol ?? String(index + 1)} src={lot.logo} />
                    <b>{lot.symbol ?? `Leg ${String(index + 1).padStart(2, "0")}`}</b>
                    <span className={styles.holdingAmount}>{strike ? formatAmount(strike.amount.atoms, strike.amount.scale) : "No observation"}</span>
                    {leg.held_back ? <Stamp kind="warn" reason="Held as a Claim" /> : <span className={styles.holdingState}>Delivering</span>}
                  </li>
                );
              })}
            </ol>
            <p>
              Devnet stand-ins carrying each stock&apos;s token settings. {hallSource(meta)}, observed {observedAge(meta.as_of)} ago.
            </p>
          </section>

          <AlloyActions alloy={alloy} onChanged={reload} />

          <section className={styles.recordFacts} aria-label="Live Alloy figures">
            <Figure
              label="Shares outstanding"
              value={formatAmount(alloy.supply, SHARE_DECIMALS)}
              unit="shares"
              source={hallSource(meta)}
              state={evidenceState(meta)}
              age={observedAge(meta.as_of)}
              observedAt={meta.as_of}
            />
            <Figure
              label="Genesis shares locked"
              value={alloy.locked_genesis ? formatAmount(alloy.locked_genesis, SHARE_DECIMALS) : undefined}
              unit="shares"
              source={hallSource(meta)}
              state={alloy.locked_genesis ? evidenceState(meta) : "unavailable"}
              age={observedAge(meta.as_of)}
              observedAt={meta.as_of}
            />
            <Figure
              label="Held-back legs"
              value={String(heldCount(alloy))}
              unit={heldCount(alloy) === 1 ? "Claim" : "Claims"}
              source={hallSource(meta)}
              state={evidenceState(meta)}
              age={observedAge(meta.as_of)}
              observedAt={meta.as_of}
            />
          </section>

          <details className={styles.recordDetails}>
            <summary>Technical details</summary>
            <div className={styles.detailsBody}>
              <dl className={styles.detailsAddresses}>
                <div><dt>Alloy account</dt><dd><Digest value={alloy.address} /></dd></div>
                <div><dt>Sponsor</dt><dd><Digest value={alloy.sponsor} /></dd></div>
                <div><dt>Share mint</dt><dd><Digest value={alloy.share_mint} /></dd></div>
                <div><dt>Evidence</dt><dd>{meta.completeness}, observed {observedAge(meta.as_of)} ago</dd></div>
              </dl>

              <section aria-labelledby="ledger-heading">
                <h2 id="ledger-heading">Hall ledger</h2>
                <p className={styles.detailsNote}>What the Hall holds for every share, from the Alloy account; delivery from each Hall-owned token account. {hallSource(meta)}, observed {observedAge(meta.as_of)} ago.</p>
                <div className={styles.detailsScroll}>
                  <table className={styles.detailsTable}>
                    <thead><tr><th scope="col">Stock</th><th scope="col">Ledger</th><th scope="col">Pending</th><th scope="col">Unclaimed</th><th scope="col">Delivery</th></tr></thead>
                    <tbody>
                      {alloy.legs.map((leg, index) => {
                        const lot = legIdentity(alloy, leg.mint);
                        return (
                          <tr key={leg.mint} data-held={leg.held_back || undefined}>
                            <th scope="row">
                              <span className={styles.detailsLot}>
                                <LotMark symbol={lot.symbol ?? String(index + 1)} src={lot.logo} />
                                <span>
                                  <b>{lot.symbol ?? `Leg ${String(index + 1).padStart(2, "0")}`}</b>
                                  <Digest value={leg.mint} />
                                </span>
                              </span>
                            </th>
                            <td>{formatAmount(leg.ledger.atoms, leg.ledger.scale)}</td>
                            <td>{formatAmount(leg.pending.atoms, leg.pending.scale)}</td>
                            <td>{formatAmount(leg.unclaimed.atoms, leg.unclaimed.scale)}</td>
                            <td>
                              {leg.held_back ? (
                                <span className={styles.detailsHeld}>
                                  <Stamp kind="warn" reason="Held as a Claim" />
                                  <small>{leg.held_back_reason ?? "The issuer currently prevents this Hall account from delivering."}</small>
                                </span>
                              ) : (
                                "Delivering"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section aria-labelledby="terms-heading">
                <h2 id="terms-heading">{value.strike.data.shares === ONE_SHARE_ATOMS.toString() ? "Per share" : `Per ${formatAmount(value.strike.data.shares, SHARE_DECIMALS)} shares`}</h2>
                <p className={styles.detailsNote}>Integer arithmetic from the Gateway, not a transaction plan. {hallSource(value.strike.meta)}, {value.strike.meta.completeness}.</p>
                <div className={styles.detailsScroll}>
                  <table className={styles.detailsTable}>
                    <thead><tr><th scope="col">Stock</th><th scope="col">Strike takes</th><th scope="col">Melt returns</th><th scope="col">Hall keeps</th></tr></thead>
                    <tbody>
                      {alloy.legs.map((leg, index) => {
                        const lot = legIdentity(alloy, leg.mint);
                        const strike = amountFor(value.strike.data, leg.mint);
                        const melt = amountFor(value.melt.data, leg.mint);
                        return (
                          <tr key={leg.mint}>
                            <th scope="row">
                              <span className={styles.detailsLot}>
                                <LotMark symbol={lot.symbol ?? String(index + 1)} src={lot.logo} />
                                <b>{lot.symbol ?? `Leg ${String(index + 1).padStart(2, "0")}`}</b>
                              </span>
                            </th>
                            <td>{strike ? formatAmount(strike.amount.atoms, strike.amount.scale) : "No observation"}</td>
                            <td>{melt ? formatAmount(melt.amount.atoms, melt.amount.scale) : "No observation"}</td>
                            <td>{melt?.kept ? formatAmount(melt.kept.atoms, melt.kept.scale) : "No observation"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </details>
        </>
      ) : null}
    </>
  );
}
