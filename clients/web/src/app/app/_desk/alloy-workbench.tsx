"use client";

import Link from "next/link";
import { Digest, Figure, Key, RouteAction, Rule, Stamp, TextAction, type EvidenceState } from "@seametry/ui";
import type {
  Alloy,
  AlloyRecordResponse,
  AlloyRegisterResponse,
  CostRow,
  Meta,
  TerminalProblem,
} from "@/lib/terminal-contract";
import { formatAmount } from "@/lib/amount";
import { PageHeader } from "../_shell/page-header";
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
        <RouteAction href="/app/hall">Open the Hall demonstration</RouteAction>
        <TextAction href="/app/alloys/storm">Inspect Alloy No. 1</TextAction>
      </div>
    </section>
  );
}

function EmptyHall({ meta }: { meta: Meta }) {
  return (
    <section className={styles.boundary} role="status">
      <div className={styles.boundaryTitle}>
        <span>Hall register</span>
        <h2>No Alloy accounts returned</h2>
      </div>
      <div className={styles.boundaryCopy}>
        <p>The {meta.cluster ?? "configured"} Hall answered with an empty account register.</p>
        <code>{meta.completeness}</code>
      </div>
      <div className={styles.boundaryActions}>
        <RouteAction href="/app/hall">Found a devnet Alloy</RouteAction>
        <TextAction href="/app/alloys/storm">Inspect Alloy No. 1</TextAction>
      </div>
    </section>
  );
}

export function AlloyRegister() {
  const { value, problem, loading } = useTerminalResource<AlloyRegisterResponse>("/api/terminal/alloys");

  return (
    <>
      <PageHeader group="Hall" title="Alloys" network="Devnet" sentence="Every Alloy account the Hall holds, read live, with its supply and any leg held back.">
        <TextAction href="/app/alloys/storm">Inspect Alloy No. 1</TextAction>
      </PageHeader>

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
          <div className={styles.tableViewport}>
            <table className={styles.alloyTable}>
              <thead>
                <tr>
                  <th>Alloy</th>
                  <th>Supply</th>
                  <th>Constituents</th>
                  <th>Delivery</th>
                  <th><span className={styles.srOnly}>Open</span></th>
                </tr>
              </thead>
              <tbody>
                {value.data.map((alloy) => {
                  const held = heldCount(alloy);
                  return (
                    <tr key={alloy.address}>
                      <td>
                        <b>Alloy {alloy.id}</b>
                        <Digest value={alloy.address} />
                      </td>
                      <td>{formatAmount(alloy.supply, 0)} shares</td>
                      <td>{alloy.legs.length} recorded</td>
                      <td>{held === 0 ? "Every leg available" : `${held} held as a Claim`}</td>
                      <td><Link href={`/app/alloys/${encodeURIComponent(alloy.address)}`}>Open Alloy</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function amountFor(row: CostRow, mint: string) {
  return row.legs.find((leg) => leg.stock === mint);
}

export function AlloyRecord({ address }: { address: string }) {
  const { value, problem, loading } = useTerminalResource<AlloyRecordResponse>(
    `/api/terminal/alloys/${encodeURIComponent(address)}`,
  );
  const alloy = value?.alloy.data;
  const meta = value?.alloy.meta;

  return (
    <>
      <div className={styles.backLink}><TextAction href="/app/alloys">Return to Alloys</TextAction></div>
      {loading ? <AlloyLoading record /> : null}
      {problem ? <AlloyBoundary problem={problem} /> : null}
      {value && alloy && meta ? (
        <>
          <section className={styles.liveAlloyPlate} aria-labelledby="live-alloy-title">
            <div className={styles.liveAlloyIdentity}>
              <span>Live Hall account</span>
              <h1 id="live-alloy-title">Alloy {alloy.id}</h1>
              <Digest value={alloy.address} />
            </div>
            <dl className={styles.liveAlloyRegistry}>
              <div><dt>Cluster</dt><dd>{alloy.cluster}</dd></div>
              <div><dt>Sponsor</dt><dd><Digest value={alloy.sponsor} /></dd></div>
              <div><dt>Share mint</dt><dd><Digest value={alloy.share_mint} /></dd></div>
              <div><dt>Evidence</dt><dd>{meta.completeness}</dd></div>
            </dl>
          </section>

          <section className={styles.alloyFacts} aria-label="Live Alloy figures">
            <Figure
              label="Shares outstanding"
              value={formatAmount(alloy.supply, 0)}
              unit="shares"
              source={hallSource(meta)}
              state={evidenceState(meta)}
              age={observedAge(meta.as_of)}
              observedAt={meta.as_of}
            />
            <Figure
              label="Genesis shares locked"
              value={alloy.locked_genesis ? formatAmount(alloy.locked_genesis, 0) : undefined}
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

          <section className={styles.assaySection}>
            <header className={styles.sectionHeading}>
              <span>01 / Hall</span>
              <h2>Constituent ledger</h2>
              <p>Balances from the Alloy account. Held-back state comes from each Hall-owned token account.</p>
            </header>
            <div className={styles.tableViewport}>
              <table className={styles.alloyLedger}>
                <caption>{hallSource(meta)} · observed {observedAge(meta.as_of)} ago · {meta.completeness}</caption>
                <thead><tr><th>Constituent</th><th>Ledger</th><th>Pending</th><th>Unclaimed</th><th>Delivery</th></tr></thead>
                <tbody>
                  {alloy.legs.map((leg, index) => (
                    <tr key={leg.mint}>
                      <td><span>Leg {String(index + 1).padStart(2, "0")}</span><Digest value={leg.mint} /></td>
                      <td>{formatAmount(leg.ledger.atoms, leg.ledger.scale)}</td>
                      <td>{formatAmount(leg.pending.atoms, leg.pending.scale)}</td>
                      <td>{formatAmount(leg.unclaimed.atoms, leg.unclaimed.scale)}</td>
                      <td>
                        {leg.held_back ? (
                          <div className={styles.heldLeg}>
                            <Stamp kind="warn" reason="Held as a Claim" />
                            <p>{leg.held_back_reason ?? "The issuer currently prevents this Hall account from delivering."}</p>
                          </div>
                        ) : "Available"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.assaySection}>
            <header className={styles.sectionHeading}>
              <span>02 / Terms</span>
              <h2>Strike and Melt terms</h2>
              <p>Integer arithmetic from the Gateway for the stated share quantity. This is not a transaction plan.</p>
            </header>
            <div className={styles.termsPlate}>
              <div className={styles.termsQuantity}>
                <span>Stated quantity</span>
                <b>{formatAmount(value.strike.data.shares, 0)} shares</b>
                <small>{hallSource(value.strike.meta)} · {value.strike.meta.completeness}</small>
              </div>
              <div className={styles.tableViewport}>
                <table className={styles.termsTable}>
                  <thead><tr><th>Constituent</th><th>Strike takes</th><th>Melt returns</th><th>Hall keeps</th></tr></thead>
                  <tbody>
                    {alloy.legs.map((leg, index) => {
                      const strike = amountFor(value.strike.data, leg.mint);
                      const melt = amountFor(value.melt.data, leg.mint);
                      return (
                        <tr key={leg.mint}>
                          <td>Leg {String(index + 1).padStart(2, "0")}</td>
                          <td>{strike ? formatAmount(strike.amount.atoms, strike.amount.scale) : "No observation"}</td>
                          <td>{melt ? formatAmount(melt.amount.atoms, melt.amount.scale) : "No observation"}</td>
                          <td>{melt?.kept ? formatAmount(melt.kept.atoms, melt.kept.scale) : "No observation"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className={styles.executionBoundary} aria-labelledby="execution-heading">
            <div>
              <span>Execution boundary</span>
              <h2 id="execution-heading">Strike</h2>
              <p>The Terminal can inspect the Hall and calculate stated terms. It has no connected transaction plan yet.</p>
              <TextAction href="/app/hall">Run the devnet demonstration</TextAction>
            </div>
            <Key disabled disabledReason="Execution is not connected to this record.">Prepare Strike</Key>
          </section>
        </>
      ) : null}
    </>
  );
}
