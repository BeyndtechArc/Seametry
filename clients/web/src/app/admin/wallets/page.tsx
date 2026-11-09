import { formatAmount } from "@/lib/amount";
import { adminQuery, adminSection, walletPageHref, type AdminWallets } from "@/lib/admin";
import { AdminHeader, DeploymentForm, Empty, Part, Unavailable, admitted, dayOf, shortAddress, utc, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

const usdc = (amount: { atoms: string; scale: number }) => formatAmount(amount.atoms, amount.scale);
const deployments = new Set(["production", "preview", "development"]);

export default async function AdminWalletsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const query = adminQuery(await searchParams);
  const deployment = query.deployment && deployments.has(query.deployment) ? query.deployment : "production";
  // The wallet list is all time, so it takes the deployment and its own
  // cursor and never a period.
  const parameters = new URLSearchParams({ deployment });
  if (query.wallets) parameters.set("cursor", query.wallets);
  const read = await adminSection<AdminWallets>(access, "wallets", parameters);
  const pageQuery = { deployment };
  return (
    <article className={styles.page}>
      <AdminHeader title="Wallets">{read.state === "read" ? `${deployment}, all time. Read from the Gateway at ${utc(read.readAt)}.` : null}</AdminHeader>
      <DeploymentForm action="/admin/wallets" deployment={deployment} />
      <Part id="wallets" title="Wallets" question="Every wallet seen in this deployment, a page at a time, with what each moved, all time.">
        {read.state !== "read" ? <Unavailable detail={read.detail} /> : read.data.wallets.length === 0 ? <Empty>No wallet has asked for a quote in this deployment.</Empty> : (
          <>
            <p className={styles.absence}>{read.data.wallets.length} of {read.data.total} wallets, newest first seen first</p>
            <table className={styles.ledger}>
              <thead>
                <tr><th scope="col">Wallet</th><th scope="col">First seen</th><th scope="col">Ref code</th><th scope="col">Quotes</th><th scope="col">Landed legs</th><th scope="col">Volume, USDC</th><th scope="col">Fee revenue, USDC</th></tr>
              </thead>
              <tbody>
                {read.data.wallets.map((wallet) => (
                  <tr key={wallet.address}>
                    <th scope="row" title={wallet.address}>{shortAddress(wallet.address)}</th>
                    <td>{dayOf(wallet.first_seen_at)}</td><td>{wallet.source}</td><td>{wallet.quotes}</td><td>{wallet.landed_legs}</td><td>{usdc(wallet.volume)}</td><td>{usdc(wallet.fee_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <nav className={styles.pages} aria-label="Wallet pages">
              {query.wallets ? <a href={walletPageHref(pageQuery)}>Newest wallets</a> : null}
              {read.data.next_cursor ? <a href={walletPageHref(pageQuery, read.data.next_cursor)}>Older wallets</a> : null}
            </nav>
          </>
        )}
      </Part>
    </article>
  );
}
