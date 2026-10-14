"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Digest, FilterBar, IconButton, LotMark, RouteAction, Rule, Stamp, TextAction, type GradeName } from "@seametry/ui";
import { Identity, List, ListCell, ListRow } from "@seametry/ui/list";
import { Tabs } from "@seametry/ui/tabs";
import { Icon } from "@seametry/ui/icons";
import type { Admission } from "@/lib/allocation/admissions";
import { relativeEvidenceAge } from "@/lib/storm-fixture";
import type {
  InstrumentAssayResponse,
  TerminalProblem,
} from "@/lib/terminal-contract";
import { formatAmount } from "@/lib/amount";
import type { CatalogueInstrument, CatalogueResponse, CatalogueState } from "@/lib/instrument-catalogue-contract";
import { shortIssuer } from "@/lib/issuers";
import { PageHeader } from "../_shell/page-header";
import styles from "./desk.module.css";

export function useTerminalResource<T>(path: string) {
  const [value, setValue] = useState<T>();
  const [problem, setProblem] = useState<TerminalProblem>();
  // Bumped after the visitor changes the chain (a Strike or a Melt), so the
  // record is read again; the shown value stays until the new one arrives.
  const [reads, setReads] = useState(0);

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
        setProblem(undefined);
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
  }, [path, reads]);

  return { value, problem, loading: !value && !problem, reload: () => setReads((count) => count + 1) };
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

const STATE_WORDS: Record<CatalogueState, string> = { available: "Available", assayed: "Assayed", listed: "Not assayed" };

/**
 * One register of every listed instrument. Tabs narrow it by assay state;
 * a column whose value would be the same on every row of the tab is left out.
 */
export function InstrumentRegister() {
  const [query, setQuery] = useState("");
  const [issuer, setIssuer] = useState("any");
  const [state, setState] = useState<CatalogueState | "any">("available");
  const [page, setPage] = useState(1);
  const catalogue = useTerminalResource<CatalogueResponse>(`/api/instruments/catalogue?q=${encodeURIComponent(query)}&issuer=${encodeURIComponent(issuer)}&state=${state}&page=${page}`);
  const meta = catalogue.value?.meta;
  const showState = state === "any";
  const showGrade = state !== "listed";
  const head = ["Instrument", "Issuer", ...(showGrade ? ["Grade"] : []), ...(showState ? ["State"] : [])];
  const columns = head.length === 4 ? styles.registerFour : head.length === 3 ? styles.registerThree : styles.registerTwo;

  return (
    <div className={styles.instrumentRegister}>
      <PageHeader
        title="Instruments"
        network="Mainnet evidence"
        info={<><p>Every listing each issuer publishes, named as the issuer wrote it into the mint. Assayed instruments carry decoded issuer powers and a policy verdict from Seametry; only Available ones can enter an Allocation.</p><p>Search does not imply an instrument passed an assay.</p></>}
      />
      <Tabs
        label="Assay state"
        controls="instrument-register"
        value={state}
        onChange={(next) => { setState(next); setPage(1); }}
        items={[
          { value: "available", label: "Available", count: meta?.states.available },
          { value: "assayed", label: "Assayed, not admitted", count: meta?.states.assayed },
          { value: "listed", label: "Not assayed", count: meta?.states.listed },
          { value: "any", label: "All", count: meta ? meta.states.available + meta.states.assayed + meta.states.listed : undefined },
        ]}
      />
      <p className={styles.registerMeta}>{meta ? `${meta.total.toLocaleString()} listings published by Backpack Securities and Backed Finance, read from their mints on ${captureLabel(meta.capturedAt)} UTC.` : "Reading the captured issuer listings."}</p>
      <FilterBar
        searchLabel="Search symbol, name or mint"
        query={query}
        onQuery={(next) => { setQuery(next); setPage(1); }}
        shown={catalogue.value?.data.length ?? 0}
        total={meta?.filtered ?? 0}
        groups={[{
          name: "catalogue-issuer",
          label: "Issuer",
          value: issuer,
          onChange: (next) => { setIssuer(next); setPage(1); },
          options: [{ value: "any", label: "Both issuers" }, ...(meta?.issuers ?? []).map((name) => ({ value: name, label: name }))],
        }]}
      />
      {catalogue.loading ? <LoadingRegister /> : null}
      {catalogue.problem ? <Boundary problem={catalogue.problem} /> : null}
      {catalogue.value && catalogue.value.data.length === 0 ? <p className={styles.quietState} role="status">{query.trim() ? `Nothing in this view matches "${query.trim()}".` : "No listing is in this state."}</p> : null}
      {catalogue.value && catalogue.value.data.length > 0 ? (
        <div id="instrument-register">
          <List label="Instruments" head={head} className={columns}>
            {catalogue.value.data.map((instrument) => (
              <ListRow key={instrument.mint} href={`/app/instruments/${encodeURIComponent(instrument.mint)}`} link={Link}>
                <Identity symbol={instrument.symbol} name={instrument.name} logo={instrument.logo} />
                <ListCell wide>{shortIssuer(instrument.issuer)}</ListCell>
                {showGrade ? <ListCell wide={showState}>{instrument.grade ?? "Not assayed"}</ListCell> : null}
                {showState ? <ListCell>{STATE_WORDS[instrument.state]}</ListCell> : null}
              </ListRow>
            ))}
          </List>
          {meta && meta.pages > 1 ? (
            <nav className={styles.cataloguePager} aria-label="Instrument pages">
              <IconButton icon="back" label="Previous page" disabled={meta.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
              <span>Page {meta.page} of {meta.pages}</span>
              <IconButton icon="next" label="Next page" disabled={meta.page >= meta.pages} onClick={() => setPage((current) => current + 1)} />
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ListedAssay({ listing }: { listing: CatalogueInstrument }) {
  return <>
    <section className={styles.assayHero}>
      <div className={styles.assayIdentity}>
        <span>Published listing</span>
        <h1 className={styles.lotIdentity}><LotMark symbol={listing.symbol} src={listing.logo} size="header" />{listing.symbol}</h1>
        {listing.name ? <p className={styles.instrumentName}>{listing.name}</p> : null}
        <Digest value={listing.mint} />
      </div>
      <dl className={styles.assayFacts}>
        <div><dt>Issuer</dt><dd>{listing.issuer}</dd></div>
        <div><dt>Assay state</dt><dd>Pending</dd></div>
        <div><dt>Listing captured</dt><dd><time dateTime={listing.capturedAt}>{captureLabel(listing.capturedAt)} UTC</time></dd></div>
        <div><dt>Solana slot</dt><dd>{listing.slot}</dd></div>
      </dl>
    </section>
    <section className={styles.assaySection}>
      <header className={styles.sectionHeading}>
        <span>Listing boundary</span>
        <h2>Not assayed yet</h2>
        <p>This instrument appears in the captured issuer catalogue, but Seametry has not persisted its registry powers, policy verdict and executable depth. It cannot enter an Allocation until those records exist.</p>
      </header>
    </section>
  </>;
}

type Named = { name?: string; logo?: string };

function CapturedAssay({ admission, grade, identity }: { admission: Admission; grade: GradeName; identity: Named }) {
  const instrument = admission.instrument;
  const decision = admission.capacity_decision;
  const capturedAt = instrument.capture.captured_at;
  const knownDecision = decision.decision === "ALLOW" || decision.decision === "WARN" || decision.decision === "BLOCK";

  return (
    <>
      <section className={styles.assayHero}>
        <div className={styles.assayIdentity}>
          <span>Captured allocation record</span>
          <h1 className={styles.lotIdentity}>
            <LotMark symbol={instrument.symbol ?? "?"} src={identity.logo} size="header" />
            {instrument.symbol ?? "Symbol unavailable"}
          </h1>
          {identity.name ? <p className={styles.instrumentName}>{identity.name}</p> : null}
          <Digest value={instrument.mint} />
        </div>
        <dl className={styles.assayFacts}>
          <div><dt>Issuer</dt><dd>{admission.issuer}</dd></div>
          <div><dt>Grade</dt><dd>{grade}</dd></div>
          <div><dt>Capture</dt><dd>{capturedAt ? <><time dateTime={capturedAt}>{captureLabel(capturedAt)} UTC</time>, {relativeEvidenceAge(capturedAt)} old</> : "Time unavailable in this record"}</dd></div>
          <div><dt>Solana slot</dt><dd>{instrument.capture.slot}</dd></div>
        </dl>
      </section>

      <section className={styles.assaySection}>
        <header className={styles.sectionHeading}>
          <span>01 / Policy</span>
          <h2>Captured decision</h2>
          <p>From the Allocation evidence under policy {decision.policy_version}. This is not a live Gateway assay. Preview a purchase for a fresh quote, policy check and simulation.</p>
        </header>
        <div className={styles.decisionPanel}>
          <div>
            {knownDecision ? <Stamp kind={decision.decision.toLowerCase() as "allow" | "warn" | "block"} reason="Decision from the captured Allocation inputs." /> : <span>{decision.decision}</span>}
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
          <span>02 / Registry</span>
          <h2>Issuer powers</h2>
          <p>Decoded from the captured instrument at slot {instrument.capture.slot}. A newer issuer observation is not available from the Gateway.</p>
        </header>
        <ol className={styles.powerRegister}>
          {instrument.prerogatives.map((prerogative, index) => (
            <li key={`${index}-${prerogative.sentence}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{prerogative.sentence}</p></li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function InstrumentAssay({ mint, identity, listing, admission, grade, canAdd, from, selected }: { mint: string; identity: Named; listing?: CatalogueInstrument; admission?: Admission; grade?: GradeName; canAdd: boolean; from?: "compose" | "allocation"; selected: string }) {
  const { value, problem, loading } = useTerminalResource<InstrumentAssayResponse>(
    `/api/terminal/instruments/${encodeURIComponent(mint)}`,
  );
  const instrument = value?.instrument.data;
  const decision = value?.admissibility.data;
  const captured = problem?.status === 404 && admission && grade ? { admission, grade } : undefined;
  const listed = problem?.status === 404 && !captured ? listing : undefined;
  const origin = from === "compose" ? "/app/compose" : from === "allocation" ? "/app/allocation" : "/app/instruments";
  const returnPath = from ? `${origin}?selected=${encodeURIComponent(selected)}` : origin;
  const destination = from === "compose" ? "/app/compose" : "/app/allocation";
  const addPath = `${destination}?selected=${encodeURIComponent(selected)}&add=${encodeURIComponent(mint)}`;

  return (
    <>
      <div className={styles.backLink}>
        <Link className={styles.backLinkAction} href={returnPath}>
          <Icon name="back" />
          <span>{from === "compose" ? "Back to Formula" : from === "allocation" ? "Back to Allocation" : "Back to instruments"}</span>
        </Link>
      </div>
      {loading ? <LoadingRegister /> : null}
      {problem && !captured && !listed ? <Boundary problem={problem} /> : null}
      {captured ? <CapturedAssay admission={captured.admission} grade={captured.grade} identity={identity} /> : null}
      {listed ? <ListedAssay listing={listed} /> : null}
      {captured && canAdd ? (
        <div className={styles.assayActions}>
          <RouteAction href={addPath}>{from === "compose" ? "Add to Formula" : "Add to basket"}</RouteAction>
          {!from ? <TextAction href={`/app/compose?add=${encodeURIComponent(mint)}`}>Add to Formula</TextAction> : null}
        </div>
      ) : null}
      {value && instrument && decision ? (
        <>
          <section className={styles.assayHero}>
            <div className={styles.assayIdentity}>
              <span>Instrument assay</span>
              <h1 className={styles.lotIdentity}>
                <LotMark symbol={instrument.symbol ?? "?"} src={identity.logo} size="header" />
                {instrument.symbol ?? "Symbol unavailable"}
              </h1>
              {identity.name ? <p className={styles.instrumentName}>{identity.name}</p> : null}
              <Digest value={instrument.mint} />
            </div>
            <dl className={styles.assayFacts}>
              <div><dt>Grade</dt><dd>{instrument.grade}</dd></div>
              <div><dt>Capture slot</dt><dd>{instrument.capture.slot}</dd></div>
              <div><dt>Captured</dt><dd>{captureLabel(instrument.capture.captured_at)} UTC</dd></div>
              <div><dt>Completeness</dt><dd>{value.instrument.meta.completeness}</dd></div>
            </dl>
          </section>

          {canAdd && decision.decision !== "BLOCK" ? (
            <div className={styles.assayActions}>
              <RouteAction href={addPath}>{from === "compose" ? "Add to Formula" : "Add to basket"}</RouteAction>
              {!from ? <TextAction href={`/app/compose?add=${encodeURIComponent(mint)}`}>Add to Formula</TextAction> : null}
            </div>
          ) : null}

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
