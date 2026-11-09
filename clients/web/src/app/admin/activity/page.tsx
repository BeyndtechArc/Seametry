import { adminPeriodRead, adminQuery, type AdminActivity } from "@/lib/admin";
import { AdminHeader, Empty, Part, RangeForm, RefusedRange, Unavailable, admitted, periodLine, shortAddress, sourceNames, utc, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

function eventName(source: string, event: string): string {
  if (source === "chain") return event === "landed" ? "Settled: landed" : event === "failed" ? "Failed, confirmed by the chain" : event === "dropped" ? "Expired, never seen on chain" : event;
  if (source === "server") return event.replace(/^quote_/, "Quote ").replace(/^leg_/, "Leg ").replace(/_/g, " ");
  return event.replace(/_/g, " ");
}

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const read = await adminPeriodRead<AdminActivity>(access, "activity", adminQuery(await searchParams));
  const data = read.section.state === "read" ? read.section.data : undefined;
  return (
    <article className={styles.page}>
      <AdminHeader title="Activity">{data && read.section.state === "read" ? periodLine(data.period, read.section.readAt) : null}</AdminHeader>
      <RangeForm action="/admin/activity" query={read.query} period={data?.period} />
      <RefusedRange detail={read.refusedRange} />
      <Part id="activity" title="Recent activity" question="The newest rows of the record, each with whose word it is. Only the chain says what settled.">
        {read.section.state !== "read" ? <Unavailable detail={read.section.detail} /> : read.section.data.rows.length === 0 ? <Empty>Nothing has been recorded before the end of this period.</Empty> : (
          <table className={styles.ledger}>
            <thead>
              <tr><th scope="col">When</th><th scope="col">Whose word</th><th scope="col">Event</th><th scope="col">Wallet</th><th scope="col">Detail</th></tr>
            </thead>
            <tbody>
              {read.section.data.rows.map((row, index) => (
                <tr key={`${row.at}-${index}`} data-source={row.source}>
                  <th scope="row">{utc(row.at)}</th><td>{sourceNames[row.source] ?? row.source}</td><td>{eventName(row.source, row.event)}</td>
                  <td title={row.wallet}>{shortAddress(row.wallet)}</td><td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>
    </article>
  );
}
