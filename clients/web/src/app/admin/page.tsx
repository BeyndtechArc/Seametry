import { Figure } from "@seametry/ui";
import { formatAmount } from "@/lib/amount";
import { adminPeriodRead, adminQuery, type AdminOverview } from "@/lib/admin";
import { AdminHeader, Part, RangeForm, RefusedRange, Unavailable, admitted, age, chainSource, periodLine, recordStyles as styles } from "./_record/record";

export const dynamic = "force-dynamic";

type Amount = { atoms: string; scale: number };
const usdc = (amount: Amount) => formatAmount(amount.atoms, amount.scale);

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const read = await adminPeriodRead<AdminOverview>(access, "overview", adminQuery(await searchParams));
  if (read.section.state !== "read") {
    return (
      <article className={styles.page}>
        <AdminHeader title="Seametry's record" />
        <RangeForm action="/admin" query={read.query} />
        <Unavailable detail={read.section.detail} />
      </article>
    );
  }

  const overview = read.section.data;
  const now = Date.parse(read.section.readAt);
  const chainAge = overview.last_reconciled_at ? age(overview.last_reconciled_at, now) : undefined;
  // Until the reconciler has written an answer, a chain-measured figure is
  // unobserved: a zero then says nothing about what settled.
  const chainState = overview.last_reconciled_at ? "verified" : "empty";

  return (
    <article className={styles.page}>
      <AdminHeader title="Seametry's record">
        {periodLine(overview.period, read.section.readAt)}{" "}
        {chainAge ? `The reconciler last wrote a chain answer ${chainAge}.` : "The reconciler has not written a chain answer yet."} Money and outcomes count only legs the chain answered for.
      </AdminHeader>
      <RangeForm action="/admin" query={read.query} period={overview.period} />
      <RefusedRange detail={read.refusedRange} />

      <Part id="overview" title="Overview" question="What moved and who traded in the period. Definitions: docs/prd/ADMIN.md.">
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
      </Part>
    </article>
  );
}
