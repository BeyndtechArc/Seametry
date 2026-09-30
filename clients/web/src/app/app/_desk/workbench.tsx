"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Digest, RouteAction, Rule, Stamp, TextAction } from "@seametry/ui";
import type {
  InstrumentAssayResponse,
  InstrumentRegisterResponse,
  TerminalProblem,
} from "@/lib/terminal-contract";
import { formatAmount } from "@/lib/amount";
import { PageHeader } from "../_shell/page-header";
import styles from "./desk.module.css";

export function useTerminalResource<T>(path: string) {
  const [value, setValue] = useState<T>();
  const [problem, setProblem] = useState<TerminalProblem>();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as T | TerminalProblem;
        if (!response.ok) {
          setProblem(body as TerminalProblem);
          return;
        }
        setValue(body as T);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProblem({
          title: "Terminal API did not answer",
          detail: error instanceof Error ? error.message : "The request ended without a response.",
          status: 502,
        });
      }
    }
    void load();
    return () => controller.abort();
  }, [path]);

  return { value, problem, loading: !value && !problem };
}

function Boundary({ problem }: { problem: TerminalProblem }) {
  return (
    <section className={styles.boundary} role="status">
      <div className={styles.boundaryTitle}>
        <span>Gateway boundary</span>
        <h2>{problem.title}</h2>
      </div>
      <div className={styles.boundaryCopy}>
        <p>{problem.detail}</p>
        <code>HTTP {problem.status}</code>
      </div>
      <div className={styles.boundaryActions}>
        <RouteAction href="/app/alloys">Inspect live Alloys</RouteAction>
        <TextAction href="/app">Return to the desk</TextAction>
      </div>
    </section>
  );
}

function LoadingRegister() {
  return (
    <section className={styles.loading} role="status">
      <span>Reading Registry, Policy and Liquidity</span>
      <Rule label="Waiting for the Gateway" />
    </section>
  );
}

function EmptyRegister({ asOf }: { asOf: string }) {
  return (
    <section className={styles.boundary} role="status">
      <div className={styles.boundaryTitle}>
        <span>Registry state</span>
        <h2>No persisted instruments</h2>
      </div>
      <div className={styles.boundaryCopy}>
        <p>The Gateway answered with an empty instrument register as of {captureLabel(asOf)} UTC.</p>
        <code>0 records</code>
      </div>
      <div className={styles.boundaryActions}>
        <RouteAction href="/app/alloys">Inspect live Alloys</RouteAction>
        <TextAction href="/app">Return to the desk</TextAction>
      </div>
    </section>
  );
}

function captureLabel(capturedAt?: string) {
  if (!capturedAt) return "Capture time unavailable";
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.valueOf())) return "Capture time unreadable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(captured);
}

function sourceAge(ageSeconds?: number) {
  if (ageSeconds === undefined) return "Age unavailable";
  if (ageSeconds < 60) return `${ageSeconds}s old`;
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  return `${Math.floor(minutes / 60)}h old`;
}

export function InstrumentRegister() {
  const { value, problem, loading } = useTerminalResource<InstrumentRegisterResponse>("/api/terminal/instruments");

  return (
    <div className={styles.instrumentRegister}>
      <PageHeader
        group="Assay"
        title="Instruments"
        network="Mainnet evidence"
        sentence="Every captured instrument with its grade, issuer powers and the slot it was read at."
      />

      {loading ? <LoadingRegister /> : null}
      {problem ? <Boundary problem={problem} /> : null}
      {value && value.data.length === 0 ? <EmptyRegister asOf={value.meta.as_of} /> : null}
      {value && value.data.length > 0 ? (
        <section className={styles.registerSection} aria-labelledby="register-heading">
          <header className={styles.sectionHeading}>
            <span>{value.meta.cluster ?? "Cluster unavailable"}</span>
            <h2 id="register-heading">Recorded instruments</h2>
            <p>Served {captureLabel(value.meta.served_at)} UTC. Completeness: {value.meta.completeness}.</p>
          </header>
          <div className={styles.tableViewport}>
            <table className={styles.instrumentTable}>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Grade</th>
                  <th>Issuer powers</th>
                  <th>Capture</th>
                  <th><span className={styles.srOnly}>Open</span></th>
                </tr>
              </thead>
              <tbody>
                {value.data.map((instrument) => (
                  <tr key={instrument.mint}>
                    <td>
                      <b>{instrument.symbol ?? "Symbol unavailable"}</b>
                      <Digest value={instrument.mint} />
                    </td>
                    <td>{instrument.grade}</td>
                    <td>{instrument.prerogatives.length} recorded</td>
                    <td>
                      <span>Slot {instrument.capture.slot}</span>
                      <small>{captureLabel(instrument.capture.captured_at)} UTC</small>
                    </td>
                    <td><Link href={`/app/instruments/${encodeURIComponent(instrument.mint)}`}>Open assay</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function InstrumentAssay({ mint }: { mint: string }) {
  const { value, problem, loading } = useTerminalResource<InstrumentAssayResponse>(
    `/api/terminal/instruments/${encodeURIComponent(mint)}`,
  );
  const instrument = value?.instrument.data;
  const decision = value?.admissibility.data;

  return (
    <>
      <div className={styles.backLink}><TextAction href="/app/instruments">Return to instruments</TextAction></div>
      {loading ? <LoadingRegister /> : null}
      {problem ? <Boundary problem={problem} /> : null}
      {value && instrument && decision ? (
        <>
          <section className={styles.assayHero}>
            <div className={styles.assayIdentity}>
              <span>Instrument assay</span>
              <h1>{instrument.symbol ?? "Symbol unavailable"}</h1>
              <Digest value={instrument.mint} />
            </div>
            <dl className={styles.assayFacts}>
              <div><dt>Grade</dt><dd>{instrument.grade}</dd></div>
              <div><dt>Capture slot</dt><dd>{instrument.capture.slot}</dd></div>
              <div><dt>Captured</dt><dd>{captureLabel(instrument.capture.captured_at)} UTC</dd></div>
              <div><dt>Completeness</dt><dd>{value.instrument.meta.completeness}</dd></div>
            </dl>
          </section>

          <section className={styles.assaySection}>
            <header className={styles.sectionHeading}>
              <span>01 / Policy</span>
              <h2>Admissibility</h2>
              <p>Produced by policy {decision.policy_version} from the recorded instrument inputs.</p>
            </header>
            <div className={styles.decisionPanel}>
              <div>
                <Stamp kind={decision.decision.toLowerCase() as "allow" | "warn" | "block"} reason="Decision produced from the recorded input digest." />
                <b>{decision.decision}</b>
              </div>
              <dl>
                <div><dt>Policy</dt><dd>{decision.policy_version}</dd></div>
                <div><dt>Input digest</dt><dd><Digest value={decision.input_digest} /></dd></div>
              </dl>
              <ul>
                {decision.reasons.map((reason) => (
                  <li key={`${reason.code}-${reason.fact}`}>
                    <code>{reason.code}</code>
                    <p>{reason.fact}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={styles.assaySection}>
            <header className={styles.sectionHeading}>
              <span>02 / Liquidity</span>
              <h2>Buy depth</h2>
              <p>Stored input sizes from the Gateway. Sell depth remains named in the response boundary.</p>
            </header>
            <div className={styles.tableViewport}>
              <table className={styles.depthTable}>
                <thead><tr><th>USDC input size</th><th>State</th><th>Shortfall</th><th>Source and age</th></tr></thead>
                <tbody>
                  {value.depth.data.points.map((point) => (
                    <tr key={`${point.size.atoms}-${point.size.scale}`}>
                      <td>{formatAmount(point.size.atoms, point.size.scale)} USDC</td>
                      <td>{point.availability === "available" ? "Available" : "No route"}</td>
                      <td>{point.shortfall_bps === undefined ? "Not measured" : `${point.shortfall_bps} bps`}</td>
                      <td>{point.provider_code ?? "Source unavailable"}, {sourceAge(point.age_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {value.depth.meta.missing?.length ? (
              <div className={styles.missingRegister}>
                {value.depth.meta.missing.map((missing) => (
                  <p key={`${missing.part}-${missing.reason}`}><b>{missing.part}</b><code>{missing.reason}</code></p>
                ))}
              </div>
            ) : null}
          </section>

          <section className={styles.assaySection}>
            <header className={styles.sectionHeading}>
              <span>03 / Registry</span>
              <h2>Issuer powers</h2>
              <p>Decoded sentences from the instrument capture. Unknown extension numbers remain visible.</p>
            </header>
            <ol className={styles.powerRegister}>
              {instrument.prerogatives.map((prerogative, index) => (
                <li key={`${index}-${prerogative.sentence}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{prerogative.sentence}</p></li>
              ))}
            </ol>
            <div className={styles.unknownRegister}>
              <span>Unknown extensions</span>
              <p>{instrument.unknown_extensions.length ? instrument.unknown_extensions.join(", ") : "None in this capture"}</p>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
