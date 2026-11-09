import { adminPeriodRead, adminQuery, type AdminOverview } from "@/lib/admin";
import { AdminHeader, Empty, Part, RangeForm, RefusedRange, Unavailable, admitted, periodLine, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

export default async function AdminFunnelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const read = await adminPeriodRead<AdminOverview>(access, "overview", adminQuery(await searchParams));
  if (read.section.state !== "read") {
    return (
      <article className={styles.page}>
        <AdminHeader title="Funnel" />
        <RangeForm action="/admin/funnel" query={read.query} />
        <Unavailable detail={read.section.detail} />
      </article>
    );
  }

  const overview = read.section.data;
  const funnel = overview.funnel;
  return (
    <article className={styles.page}>
      <AdminHeader title="Funnel">{periodLine(overview.period, read.section.readAt)}</AdminHeader>
      <RangeForm action="/admin/funnel" query={read.query} period={overview.period} />
      <RefusedRange detail={read.refusedRange} />

      <Part id="funnel" title="Funnel" question="How far each quote prepared in the period went, and whose word each step is.">
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
      </Part>

      <Part id="reliability" title="Reliability" question="What happened to legs sent in the period, by landing path.">
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
      </Part>
    </article>
  );
}
