import { adminPeriodRead, adminQuery, type AdminEmailOptIns } from "@/lib/admin";
import { AdminHeader, Empty, Part, RangeForm, RefusedRange, Unavailable, admitted, periodLine, utc, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

export default async function AdminOptInsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const read = await adminPeriodRead<AdminEmailOptIns>(access, "email-optins", adminQuery(await searchParams));
  const data = read.section.state === "read" ? read.section.data : undefined;
  return (
    <article className={styles.page}>
      <AdminHeader title="Email opt-ins">{data && read.section.state === "read" ? periodLine(data.period, read.section.readAt) : null}</AdminHeader>
      <RangeForm action="/admin/opt-ins" query={read.query} period={data?.period} />
      <RefusedRange detail={read.refusedRange} />
      <Part id="optins" title="Email opt-ins" question="Who agreed to hear from Seametry in the period, counted, with addresses masked by the Gateway.">
        {read.section.state !== "read" ? <Unavailable detail={read.section.detail} /> : read.section.data.counts.length === 0 ? <Empty>No email consent was given in this period.</Empty> : (
          <>
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Page</th><th scope="col">Ref code</th><th scope="col">State</th><th scope="col">Consents</th></tr>
              </thead>
              <tbody>
                {read.section.data.counts.map((count) => (
                  <tr key={`${count.live}-${count.page}-${count.ref_code}`}>
                    <th scope="row">{count.page.replace(/_/g, " ")}</th><td>{count.ref_code}</td><td>{count.live ? "Kept" : "Withdrawn, address erased"}</td><td>{count.optins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {read.section.data.recent.length > 0 ? (
              <table className={styles.ledger}>
                <caption>Newest kept consents</caption>
                <thead><tr><th scope="col">Address, masked</th><th scope="col">Given</th><th scope="col">Page</th><th scope="col">Ref code</th></tr></thead>
                <tbody>
                  {read.section.data.recent.map((optIn, index) => (
                    <tr key={`${optIn.consented_at}-${index}`}><th scope="row">{optIn.masked_address}</th><td>{utc(optIn.consented_at)}</td><td>{optIn.page.replace(/_/g, " ")}</td><td>{optIn.ref_code}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </Part>
    </article>
  );
}
