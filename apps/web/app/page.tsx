import coverageSnapshot from "../../../evidence/coverage-latest.json";

interface Coverage { generatedAt: string; rows: Array<{ instrument: { symbol: string; underlying: string }; issuer: string; jupiter: string; chainlink: string; stork: string; route?: string; priceImpactPct?: number }> }

export default function Page() {
  const coverage: Coverage = coverageSnapshot;
  return <main>
    <nav><span className="wordmark">SEAMETRY</span><span className="tag">PUBLIC EVIDENCE CONSOLE</span></nav>
    <section className="hero"><p className="eyebrow">TOKENIZED EQUITIES / SOLANA</p><h1>One price display.<br/><em>Several truths underneath.</em></h1><p className="lede">Seametry exposes issuer windows, independent reference availability, and executable route quality before a user approves a trade.</p></section>
    <section className="panel">
      <div className="panelHead"><div><p className="eyebrow">LATEST COVERAGE PROBE</p><h2>Weekend boundary</h2></div><span className="timestamp">{coverage ? new Date(coverage.generatedAt).toUTCString() : "Run npm run coverage"}</span></div>
      <div className="grid header"><span>Asset</span><span>Issuer</span><span>Route</span><span>Impact</span><span>Chainlink</span><span>Stork</span></div>
      {coverage?.rows.map((row) => <div className="grid row" key={row.instrument.symbol}>
        <strong>{row.instrument.symbol}<small>{row.instrument.underlying}</small></strong><State value={row.issuer}/><span>{row.route ?? "Unavailable"}</span><span>{row.priceImpactPct === undefined ? "n/a" : row.priceImpactPct + "%"}</span><State value={row.chainlink}/><State value={row.stork}/>
      </div>) ?? <p className="empty">No evidence snapshot yet.</p>}
    </section>
    <section className="principles"><article><span>01</span><h3>Observe</h3><p>Read the issuer and market clocks independently.</p></article><article><span>02</span><h3>Compare</h3><p>Keep oracle absence and disagreement visible.</p></article><article><span>03</span><h3>Approve</h3><p>Show the executable route as a route, not as a valuation.</p></article></section>
    <footer>Market-state disclosure, not investment advice. Every transaction requires explicit wallet approval.</footer>
  </main>;
}

function State({ value }: { value: string }) { const tone = value === "live" ? "good" : value === "halted" ? "bad" : "warn"; return <span className={"state " + tone}>{value}</span>; }
