"use client";

import { useEffect, useState } from "react";
import { Field, Grade, LotMark, QuietAction, Rule, Stamp } from "@seametry/ui";
import { formatAmount, parseAmount } from "@/lib/amount";
import { logoFor } from "@/lib/instrument-logos";
import { MAX_CONSTITUENTS, SHARE_DECIMALS } from "@/lib/hall/constants";
import { USDC_SCALE, draftFormula, identityProblem, unitsToAtoms, type QuotedLeg, type Weighting } from "@/lib/compose/formula";
import { FoundingPanel } from "./founding";
import styles from "./compose.module.css";

export type Candidate = {
  mint: string;
  symbol: string;
  issuer: string;
  decimals: number;
  decision: "ALLOW" | "WARN" | "BLOCK";
  admitted: boolean;
  fact?: string;
};

type Quote = { mint: string; inAtoms: string; outAtoms: string; venues: string[] } | { mint: string; problem: string };
type Quotes = { source: string; observedAt: string; quotes: Quote[] };
type QuoteReading = { state: "reading" } | { state: "read"; quotes: Quotes } | { state: "unavailable"; reason: string };

function age(observedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(observedAt)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}

// Ticking several boxes in a row is one decision, so the selection is asked
// about once it has been still this long, not once per tick.
const SETTLE_MS = 600;

/** One quote per settled selection; a superseded request is cancelled, not merely ignored. */
function useQuotes(mints: string[], refresh: number): QuoteReading | undefined {
  const request = mints.length > 0 ? `${mints.join(",")}|${refresh}` : undefined;
  const [answer, setAnswer] = useState<{ request: string; reading: QuoteReading }>();
  useEffect(() => {
    if (!request) return;
    const cancel = new AbortController();
    const settle = (reading: QuoteReading) => {
      if (!cancel.signal.aborted) setAnswer({ request, reading });
    };
    const timer = setTimeout(() => {
      fetch(`/api/compose/quotes?mints=${request.split("|")[0]}`, { signal: cancel.signal })
        .then(async (response) => {
          const body = await response.json();
          settle(response.ok ? { state: "read", quotes: body as Quotes } : { state: "unavailable", reason: body.error });
        })
        .catch((error: unknown) => settle({ state: "unavailable", reason: error instanceof Error ? error.message : "The quote request did not complete." }));
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      cancel.abort();
    };
  }, [request]);
  if (!request) return undefined;
  return answer?.request === request ? answer.reading : { state: "reading" };
}

export function Composer({ candidates, policy, unquoted }: { candidates: Candidate[]; policy: { version: string; age: string }; unquoted?: string }) {
  // Nothing is chosen at the start: choosing what a share holds is the point
  // of the page, and fifteen admitted instruments already exceed what one
  // Alloy can hold.
  const [selected, setSelected] = useState<string[]>([]);
  const full = selected.length >= MAX_CONSTITUENTS;
  const [method, setMethod] = useState<Weighting["method"]>("value");
  const [valueTyped, setValueTyped] = useState("100");
  const [unitsTyped, setUnitsTyped] = useState("0.1");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [refresh, setRefresh] = useState(0);

  const chosen = candidates.filter((candidate) => selected.includes(candidate.mint));
  const quoting = useQuotes(unquoted ? [] : chosen.map((candidate) => candidate.mint), refresh);
  const reading: QuoteReading | undefined = unquoted && chosen.length > 0 ? { state: "unavailable", reason: unquoted } : quoting;

  const parsedValue = parseAmount(valueTyped, USDC_SCALE);
  const weighting: Weighting | { refused: string } =
    method === "value"
      ? "atoms" in parsedValue ? { method, usdcPerShare: parsedValue.atoms } : parsedValue
      : { method, unitsPerShare: unitsTyped };

  const quoteOf = (mint: string) => (reading?.state === "read" ? reading.quotes.quotes.find((entry) => entry.mint === mint) : undefined);
  const unpriced = chosen
    .map((candidate) => ({ candidate, quote: quoteOf(candidate.mint) }))
    .find(({ quote }) => quote && "problem" in quote);
  const quoted: QuotedLeg[] | undefined =
    reading?.state === "read" && !unpriced
      ? chosen.map((candidate) => {
          const quote = quoteOf(candidate.mint);
          const priced = quote && !("problem" in quote) ? quote : { inAtoms: "0", outAtoms: "0" };
          return { ...candidate, quote: { inAtoms: BigInt(priced.inAtoms), outAtoms: BigInt(priced.outAtoms) } };
        })
      : undefined;
  const draft =
    "refused" in weighting
      ? weighting
      : unpriced
        ? { refused: `${unpriced.candidate.symbol} has no quote. ${unpriced.quote && "problem" in unpriced.quote ? unpriced.quote.problem : ""}` }
        : quoted
          ? draftFormula(quoted, weighting)
          : undefined;
  const identity = identityProblem(name, symbol);

  const foundingDraft =
    draft && "legs" in draft && !identity && reading?.state === "read"
      ? JSON.stringify(
          {
            name: name.trim(),
            symbol,
            network: "devnet",
            shareDecimals: SHARE_DECIMALS,
            weighting: method === "value" ? "equal value at founding" : "equal units",
            formula: draft.legs.map((leg) => ({ mint: leg.mint, symbol: leg.symbol, atomsPerShare: leg.atomsPerShare.toString(), decimals: leg.decimals })),
            pricedBy: { source: reading.quotes.source, observedAt: reading.quotes.observedAt },
          },
          null,
          2,
        )
      : undefined;

  return (
    <div className={styles.compose}>
      <div className={styles.inputs}>
        <section aria-labelledby="constituents-heading">
          <span className={styles.label}>01 / Constituents</span>
          <h2 id="constituents-heading">Choose what a share holds</h2>
          <p className={styles.note}>
            Only instruments captured and assayed by the policy engine can enter a Formula ({policy.version}, captured {policy.age} ago). To add another stock, capture it first.
          </p>
          <p className={full ? styles.problem : styles.note}>
            {selected.length} of at most {MAX_CONSTITUENTS} chosen{full ? ". An Alloy holds no more legs than this; remove one to choose another." : "."}
          </p>
          <ul className={styles.candidates}>
            {candidates.map((candidate) => (
              <li key={candidate.mint} data-refused={!candidate.admitted || undefined}>
                <label>
                  <input
                    type="checkbox"
                    disabled={!candidate.admitted || (full && !selected.includes(candidate.mint))}
                    checked={selected.includes(candidate.mint)}
                    onChange={(event) =>
                      setSelected((current) => (event.target.checked ? [...current, candidate.mint] : current.filter((mint) => mint !== candidate.mint)))
                    }
                  />
                  <LotMark symbol={candidate.symbol} src={logoFor(candidate.mint)} />
                  <span>
                    <b>{candidate.symbol}</b>
                    <small>{candidate.issuer}</small>
                  </span>
                </label>
                <div className={styles.marks}>
                  <Grade name="Certificate" />
                  {candidate.admitted ? (
                    <Stamp kind={candidate.decision === "ALLOW" ? "allow" : "warn"} reason={candidate.decision === "ALLOW" ? "Admitted" : "Admitted with a warning"} />
                  ) : (
                    <Stamp kind="block" reason={candidate.fact ?? "Refused by the policy engine"} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="weighting-heading">
          <span className={styles.label}>02 / Weighting</span>
          <h2 id="weighting-heading">Fix the quantities</h2>
          <div className={styles.methods} role="radiogroup" aria-label="Weighting">
            <label data-chosen={method === "value" || undefined}>
              <input type="radio" name="method" checked={method === "value"} onChange={() => setMethod("value")} />
              <span>
                <b>Equal value at founding</b>
                <small>Each leg is worth the same at the quote. Quantities differ by price.</small>
              </span>
            </label>
            <label data-chosen={method === "units" || undefined}>
              <input type="radio" name="method" checked={method === "units"} onChange={() => setMethod("units")} />
              <span>
                <b>Equal units</b>
                <small>Each share holds the same quantity of every stock. The dearest stock weighs most.</small>
              </span>
            </label>
          </div>
          {method === "value" ? (
            <Field id="usdc-per-share" label="Value of one share at founding, USDC" inputMode="decimal" value={valueTyped} onChange={(event) => setValueTyped(event.target.value)} message={"refused" in parsedValue ? parsedValue.refused : undefined} invalid={"refused" in parsedValue} />
          ) : (
            <Field id="units-per-share" label="Units of each stock per share" inputMode="decimal" value={unitsTyped} onChange={(event) => setUnitsTyped(event.target.value)} />
          )}
          <p className={styles.note}>A Formula is fixed at founding and never rebalances, so these weights hold only at the quote and drift as prices move.</p>
        </section>

        <section aria-labelledby="identity-heading">
          <span className={styles.label}>03 / Identity</span>
          <h2 id="identity-heading">Name the share</h2>
          <div className={styles.identity}>
            <Field id="alloy-name" label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alloy name" />
            <Field id="alloy-symbol" label="Symbol" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="SYMBOL" />
          </div>
          <p className={identity && (name || symbol) ? styles.problem : styles.note}>
            {identity && (name || symbol) ? identity : "Written into the share mint at founding and never changeable after it."}
          </p>
        </section>
      </div>

      <aside className={styles.sheet} aria-labelledby="draft-heading" data-testid="formula-draft">
        <span className={styles.label}>Draft</span>
        <h2 id="draft-heading">One share holds</h2>
        {!reading ? (
          <p className={styles.note}>Choose at least one constituent.</p>
        ) : reading.state === "reading" ? (
          <div className={styles.reading} role="status">
            <span>Reading mainnet quotes</span>
            <Rule label="Waiting for Jupiter" />
          </div>
        ) : reading.state === "unavailable" ? (
          <>
            <p className={styles.problem} role="status">Quotes unavailable. {reading.reason}</p>
            {method === "units" ? (
              <table className={styles.ledger}>
                <thead><tr><th>Constituent</th><th>Per share</th><th>Value</th></tr></thead>
                <tbody>
                  {chosen.map((candidate) => {
                    const atoms = unitsToAtoms(unitsTyped, candidate.decimals);
                    return (
                      <tr key={candidate.mint}>
                        <th scope="row"><span className={styles.lot}><LotMark symbol={candidate.symbol} src={logoFor(candidate.mint)} />{candidate.symbol}</span></th>
                        <td>{typeof atoms === "bigint" ? formatAmount(atoms, candidate.decimals) : "No observation"}</td>
                        <td>No observation</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </>
        ) : draft && "refused" in draft ? (
          <p className={styles.problem} role="status">{draft.refused}</p>
        ) : draft ? (
          <>
            <table className={styles.ledger}>
              <thead><tr><th>Constituent</th><th>Per share</th><th>At the quote</th><th>Weight</th></tr></thead>
              <tbody>
                {draft.legs.map((leg) => (
                  <tr key={leg.mint}>
                    <th scope="row"><span className={styles.lot}><LotMark symbol={leg.symbol} src={logoFor(leg.mint)} />{leg.symbol}</span></th>
                    <td>{formatAmount(leg.atomsPerShare, leg.decimals)}</td>
                    <td>{formatAmount(leg.usdcPerShare, USDC_SCALE)} USDC</td>
                    <td>{formatAmount(leg.weightBps, 2)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th scope="row">One share</th><td /><td>{formatAmount(draft.usdcPerShare, USDC_SCALE)} USDC</td><td /></tr>
              </tfoot>
            </table>
            <p className={styles.note}>
              {reading.quotes.source}, 100 USDC per constituent, observed <time dateTime={reading.quotes.observedAt}>{age(reading.quotes.observedAt)}</time> ago. Not executable on devnet; the devnet Alloy uses mock stocks with these quantities.
            </p>
          </>
        ) : null}
        {reading && reading.state !== "reading" && !unquoted ? (
          <QuietAction type="button" onClick={() => setRefresh((count) => count + 1)}>Read the quotes again</QuietAction>
        ) : null}

        <div className={styles.founding}>
          <span className={styles.label}>Founding draft</span>
          {foundingDraft ? (
            <pre><code>{foundingDraft}</code></pre>
          ) : (
            <p className={styles.note}>Appears once the Formula is priced and the name and symbol are set. Founding happens on the devnet Hall, deliberately, after this draft is agreed.</p>
          )}
        </div>
        {foundingDraft && draft && "legs" in draft ? (
          <FoundingPanel legs={draft.legs.map((leg) => ({ mint: leg.mint, atomsPerShare: leg.atomsPerShare }))} name={name.trim()} symbol={symbol} />
        ) : null}
      </aside>
    </div>
  );
}
