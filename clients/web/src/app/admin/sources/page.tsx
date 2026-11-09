import { formatAmount } from "@/lib/amount";
import { adminPeriodRead, adminQuery, type AdminSources } from "@/lib/admin";
import { AdminHeader, Empty, Part, RangeForm, RefusedRange, Unavailable, admitted, periodLine, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

const usdc = (amount: { atoms: string; scale: number }) => formatAmount(amount.atoms, amount.scale);

export default async function AdminSourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const read = await adminPeriodRead<AdminSources>(access, "sources", adminQuery(await searchParams));
  const data = read.section.state === "read" ? read.section.data : undefined;
  return (
    <article className={styles.page}>
      <AdminHeader title="Sources">{data && read.section.state === "read" ? periodLine(data.period, read.section.readAt) : null}</AdminHeader>
      <RangeForm action="/admin/sources" query={read.query} period={data?.period} />
      <RefusedRange detail={read.refusedRange} />
      <Part id="sources" title="Sources" question="Which first-touch ref code brought the wallets that traded.">
        {read.section.state !== "read" ? <Unavailable detail={read.section.detail} /> : read.section.data.sources.length === 0 ? <Empty>No wallet was seen or traded in this period.</Empty> : (
          <table className={styles.ledger}>
            <thead>
              <tr><th scope="col">Ref code</th><th scope="col">Seen</th><th scope="col">Activated</th><th scope="col">Active</th><th scope="col">Volume, USDC</th><th scope="col">Fee revenue, USDC</th></tr>
            </thead>
            <tbody>
              {read.section.data.sources.map((source) => (
                <tr key={source.source}>
                  <th scope="row">{source.source === "unknown" ? "Unknown, none kept" : source.source}</th>
                  <td>{source.seen_wallets}</td><td>{source.activated_wallets}</td><td>{source.active_wallets}</td><td>{usdc(source.volume)}</td><td>{usdc(source.fee_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>
    </article>
  );
}
