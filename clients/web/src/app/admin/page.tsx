import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Figure } from "@seametry/ui";
import { formatAmount } from "@/lib/amount";
import { readAdmin, type AdminQuery, type AdminRead, type Section } from "@/lib/admin";
import { PublicShell } from "../public-shell";
import site from "../site.module.css";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

// No metadata export: a title naming this page would reach the head of the
// 404 a non-admin is shown, and the page's existence is not advertised.

type Amount = { atoms: string; scale: number };

const usdc = (amount: Amount) => formatAmount(amount.atoms, amount.scale);

function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

const shortAddress = (address: string) => (address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address || "No wallet yet");
const utc = (iso: string) => iso.replace("T", " ").replace(/:\d{2}(\.\d+)?Z$/, " UTC");
const dayOf = (iso: string) => iso.slice(0, 10);

const sourceNames: Record<string, string> = { server: "Seametry sent", client: "Browser reported", chain: "Chain answered" };

function eventName(source: string, event: string): string {
  if (source === "chain") return event === "landed" ? "Settled: landed" : event === "failed" ? "Failed, confirmed by the chain" : event === "dropped" ? "Expired, never seen on chain" : event;
  if (source === "server") return event.replace(/^quote_/, "Quote ").replace(/^leg_/, "Leg ").replace(/_/g, " ");
  return event.replace(/_/g, " ");
}

function Unavailable({ detail }: { detail: string }) {
  return <p className={styles.absence}>{detail} Nothing from this section is shown.</p>;
}

function Empty({ children }: { children: string }) {
  return <p className={styles.absence}>{children}</p>;
}

function Section<T>({ id, title, question, section, children }: { id: string; title: string; question: string; section: Section<T>; children: (data: T) => React.ReactNode }) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <header>
        <h2 id={id}>{title}</h2>
        <p>{question}</p>
      </header>
      {section.state === "read" ? children(section.data) : <Unavailable detail={section.detail} />}
    </section>
  );
}

function RangeForm({ query, period }: { query: AdminQuery; period: AdminRead["overview"]["period"] }) {
  const lastDay = new Date(Date.parse(period.to) - 1).toISOString();
  return (
    <form className={styles.range} method="get" action="/admin">
      <label>
        <span>From</span>
        <input type="date" name="from" defaultValue={query.from ?? dayOf(period.from)} />
      </label>
      <label>
        <span>To, inclusive</span>
        <input type="date" name="to" defaultValue={query.to ?? dayOf(lastDay)} />
      </label>
      <label>
        <span>Deployment</span>
        <select name="deployment" defaultValue={period.deployment}>
          <option value="production">Production</option>
          <option value="preview">Preview</option>
          <option value="development">Development</option>
        </select>
      </label>
      <button type="submit" className={styles.read}>Read the period</button>
    </form>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const query: AdminQuery = { from: one(raw.from), to: one(raw.to), deployment: one(raw.deployment) };
  const admin = await readAdmin((await headers()).get("cookie"), query);
  if (!admin) notFound();

  const now = Date.parse(admin.readAt);
  const { overview } = admin;
  const chainAge = overview.last_reconciled_at ? age(overview.last_reconciled_at, now) : undefined;
  const chainSource = "Solana mainnet, read by Seametry's reconciler";
  const funnel = overview.funnel;
  // Until the reconciler has written an answer, a chain-measured figure is
  // unobserved: a zero then says nothing about what settled.
  const chainState = overview.last_reconciled_at ? "verified" : "empty";

  return (
    <PublicShell>
      <article className={`${site.paper} ${styles.admin}`}>
        <header className={site.storyHero}>
          <span>Admin</span>
          <h1>Seametry&apos;s record</h1>
          <p>
            {utc(overview.period.from)} to {utc(overview.period.to)}, {overview.period.deployment}. Read from the Gateway at {utc(admin.readAt)}.{" "}
            {chainAge ? `The reconciler last wrote a chain answer ${chainAge}.` : "The reconciler has not written a chain answer yet."} Money and outcomes count only legs the chain answered for.
          </p>
        </header>

        <RangeForm query={admin.refusedRange ? {} : admin.query} period={overview.period} />
        {admin.refusedRange ? <p className={styles.absence} role="status">The range was refused: {admin.refusedRange} The last 30 days are shown instead.</p> : null}

        <section className={styles.section} aria-labelledby="overview">
          <header>
            <h2 id="overview">Overview</h2>
            <p>What moved and who traded in the period. Definitions: docs/prd/ADMIN.md.</p>
          </header>
          <div className={styles.figures}>
            <Figure label="Volume" value={usdc(overview.volume)} unit="USDC" source={chainSource} state={chainState} age={chainAge} observedAt={overview.last_reconciled_at} size="regular" />
            <Figure label="Fee revenue" value={usdc(overview.fee_revenue)} unit="USDC" source={chainSource} state={chainState} age={chainAge} observedAt={overview.last_reconciled_at} size="regular" />
            <Figure label="Tip cost" value={usdc(overview.tip_cost)} unit="USDC" source="Quoted tip offset of chain-measured volume" state="unverified" size="regular" />
            <Figure label="Landed legs" value={String(overview.landed_legs)} source={chainSource} state={chainState} size="regular" />
          </div>
          <table className={styles.ledger}>
            <caption>Wallets in the period</caption>
            <thead>
              <tr><th scope="col">State</th><th scope="col">Wallets</th><th scope="col">Whose word</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Seen, a first quote</th><td>{overview.wallets.seen}</td><td>Seametry sent</td></tr>
              <tr><th scope="row">Of those, activated by the period&apos;s end</th><td>{overview.wallets.seen_and_activated} of {overview.wallets.seen}</td><td>Chain answered</td></tr>
              <tr><th scope="row">Activated, a first landed leg</th><td>{overview.wallets.activated}</td><td>Chain answered</td></tr>
              <tr><th scope="row">Active, a landed leg</th><td>{overview.wallets.active}</td><td>Chain answered</td></tr>
              <tr><th scope="row">Returning, landed on two or more days</th><td>{overview.wallets.returning}</td><td>Chain answered</td></tr>
            </tbody>
          </table>
        </section>

        <section className={styles.section} aria-labelledby="funnel">
          <header>
            <h2 id="funnel">Funnel</h2>
            <p>How far each quote prepared in the period went, and whose word each step is.</p>
          </header>
          {funnel.requested === 0 ? <Empty>No quote was prepared in this period.</Empty> : (
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Step</th><th scope="col">Quotes</th><th scope="col">Whose word</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row">Requested</th><td>{funnel.requested}</td><td>Seametry sent</td></tr>
                <tr><th scope="row">Prepared</th><td>{funnel.prepared}</td><td>Seametry sent</td></tr>
                <tr><th scope="row">Refused</th><td>{funnel.refused}</td><td>Seametry sent</td></tr>
                <tr><th scope="row">Review opened</th><td>{funnel.review_opened}</td><td>Browser reported</td></tr>
                <tr><th scope="row">Signature requested</th><td>{funnel.signature_requested}</td><td>Browser reported</td></tr>
                <tr><th scope="row">Signature declined</th><td>{funnel.signature_declined}</td><td>Browser reported</td></tr>
                <tr><th scope="row">Signature failed</th><td>{funnel.signature_failed}</td><td>Browser reported</td></tr>
                <tr><th scope="row">Sheet abandoned</th><td>{funnel.sheet_abandoned}</td><td>Browser reported</td></tr>
                <tr><th scope="row">Sent</th><td>{funnel.sent}</td><td>Seametry sent</td></tr>
                <tr><th scope="row">Landed</th><td>{funnel.landed}</td><td>Chain answered</td></tr>
              </tbody>
            </table>
          )}
          {overview.refusals.length > 0 ? (
            <table className={styles.ledger}>
              <caption>Refusals by status</caption>
              <thead><tr><th scope="col">Status</th><th scope="col">Quotes</th></tr></thead>
              <tbody>
                {overview.refusals.map((refusal) => <tr key={refusal.status}><th scope="row">{refusal.status}</th><td>{refusal.quotes}</td></tr>)}
              </tbody>
            </table>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="reliability">
          <header>
            <h2 id="reliability">Reliability</h2>
            <p>What happened to legs sent in the period, by landing path.</p>
          </header>
          {overview.reliability.length === 0 ? <Empty>No leg was sent in this period.</Empty> : (
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Landing</th><th scope="col">Sent</th><th scope="col">Landed</th><th scope="col">Failed</th><th scope="col">Dropped</th><th scope="col">No chain answer yet</th></tr>
              </thead>
              <tbody>
                {overview.reliability.map((path) => (
                  <tr key={path.landing}><th scope="row">{path.landing}</th><td>{path.sent}</td><td>{path.landed}</td><td>{path.failed}</td><td>{path.dropped}</td><td>{path.unanswered}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <Section id="sources" title="Sources" question="Which first-touch ref code brought the wallets that traded." section={admin.sources}>
          {(data) => data.sources.length === 0 ? <Empty>No wallet was seen or traded in this period.</Empty> : (
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Ref code</th><th scope="col">Seen</th><th scope="col">Activated</th><th scope="col">Active</th><th scope="col">Volume, USDC</th><th scope="col">Fee revenue, USDC</th></tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source.source}>
                    <th scope="row">{source.source === "unknown" ? "Unknown, none kept" : source.source}</th>
                    <td>{source.seen_wallets}</td><td>{source.activated_wallets}</td><td>{source.active_wallets}</td><td>{usdc(source.volume)}</td><td>{usdc(source.fee_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section id="wallets" title="Wallets" question="The 200 wallets most recently seen in this deployment, with what each moved, all time." section={admin.wallets}>
          {(data) => data.wallets.length === 0 ? <Empty>No wallet has asked for a quote in this deployment.</Empty> : (
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Wallet</th><th scope="col">First seen</th><th scope="col">Ref code</th><th scope="col">Quotes</th><th scope="col">Landed legs</th><th scope="col">Volume, USDC</th><th scope="col">Fee revenue, USDC</th></tr>
              </thead>
              <tbody>
                {data.wallets.map((wallet) => (
                  <tr key={wallet.address}>
                    <th scope="row" title={wallet.address}>{shortAddress(wallet.address)}</th>
                    <td>{dayOf(wallet.first_seen_at)}</td><td>{wallet.source}</td><td>{wallet.quotes}</td><td>{wallet.landed_legs}</td><td>{usdc(wallet.volume)}</td><td>{usdc(wallet.fee_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section id="activity" title="Recent activity" question="The newest rows of the record, each with whose word it is. Only the chain says what settled." section={admin.activity}>
          {(data) => data.rows.length === 0 ? <Empty>Nothing has been recorded before the end of this period.</Empty> : (
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">When</th><th scope="col">Whose word</th><th scope="col">Event</th><th scope="col">Wallet</th><th scope="col">Detail</th></tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${row.at}-${index}`} data-source={row.source}>
                    <th scope="row">{utc(row.at)}</th><td>{sourceNames[row.source] ?? row.source}</td><td>{eventName(row.source, row.event)}</td>
                    <td title={row.wallet}>{shortAddress(row.wallet)}</td><td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section id="optins" title="Email opt-ins" question="Who agreed to hear from Seametry in the period, counted, with addresses masked by the Gateway." section={admin.optIns}>
          {(data) => data.counts.length === 0 ? <Empty>No email consent was given in this period.</Empty> : (
            <>
              <table className={styles.ledger}>
                <thead>
                  <tr><th scope="col">Page</th><th scope="col">Ref code</th><th scope="col">State</th><th scope="col">Consents</th></tr>
                </thead>
                <tbody>
                  {data.counts.map((count) => (
                    <tr key={`${count.live}-${count.page}-${count.ref_code}`}>
                      <th scope="row">{count.page.replace(/_/g, " ")}</th><td>{count.ref_code}</td><td>{count.live ? "Kept" : "Withdrawn, address erased"}</td><td>{count.optins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.recent.length > 0 ? (
                <table className={styles.ledger}>
                  <caption>Newest kept consents</caption>
                  <thead><tr><th scope="col">Address, masked</th><th scope="col">Given</th><th scope="col">Page</th><th scope="col">Ref code</th></tr></thead>
                  <tbody>
                    {data.recent.map((optIn, index) => (
                      <tr key={`${optIn.consented_at}-${index}`}><th scope="row">{optIn.masked_address}</th><td>{utc(optIn.consented_at)}</td><td>{optIn.page.replace(/_/g, " ")}</td><td>{optIn.ref_code}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </>
          )}
        </Section>
      </article>
    </PublicShell>
  );
}
