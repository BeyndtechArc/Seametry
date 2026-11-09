import Link from "next/link";
import { adminSection, type AdminPerson } from "@/lib/admin";
import { AdminHeader, Empty, Part, Unavailable, admitted, shortAddress, sourceNames, utc, recordStyles as styles } from "../../_record/record";
import { outreachNames, provenanceNames, stageNames } from "../people";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const kindNames: Record<string, string> = { wallet: "Wallet", account: "Account", x: "X", colosseum: "Colosseum page", web: "Web page", unrecognised: "Unrecognised handle" };

/** An event's own properties, read out as written; a nested value is shown as its JSON. */
function details(properties: Record<string, unknown>): string {
  return Object.entries(properties)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`)
    .join(", ");
}

export default async function AdminPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await admitted();
  const { id } = await params;
  // A path that is not an id never reaches the Gateway as part of its path.
  const read = uuid.test(id)
    ? await adminSection<AdminPerson>(access, `people/${id}`, new URLSearchParams({ limit: "100" }))
    : { state: "unavailable" as const, detail: `"${id}" is not a person id.` };

  if (read.state !== "read") {
    return (
      <article className={styles.page}>
        <AdminHeader title="Person" />
        <Unavailable detail={read.detail} />
        <Link className={styles.rowLink} href="/admin/people">Open the people list</Link>
      </article>
    );
  }

  const { person, imported, identities, timeline } = read.data;
  return (
    <article className={styles.page}>
      <AdminHeader title={person.display_name}>
        {stageNames[person.stage] ?? person.stage}, outreach {(outreachNames[person.outreach_status] ?? person.outreach_status).toLowerCase()}. Came from {person.created_from === "import" ? "a lead ledger" : "signing in"} on {utc(person.created_at)}; last changed {utc(person.updated_at)}. Read from the Gateway at {utc(read.readAt)}.
      </AdminHeader>

      <Part id="identities" title="Identities" question="Every way the record knows this person, and whose word each is.">
        {identities.length === 0 ? <Empty>The record holds no identity for this person.</Empty> : (
          <table className={styles.ledger}>
            <thead><tr><th scope="col">Kind</th><th scope="col">Value</th><th scope="col">Whose word</th><th scope="col">First seen</th><th scope="col">Last seen</th></tr></thead>
            <tbody>
              {identities.map((identity) => (
                <tr key={`${identity.kind}-${identity.value}`} data-verified={identity.verified || undefined}>
                  <th scope="row">{kindNames[identity.kind] ?? identity.kind}</th>
                  <td title={identity.value}>{identity.kind === "wallet" ? shortAddress(identity.value) : identity.kind === "x" ? `@${identity.value}` : identity.value}</td>
                  <td>{provenanceNames[identity.provenance] ?? identity.provenance}</td>
                  <td>{utc(identity.first_seen_at)}</td>
                  <td>{utc(identity.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>

      {imported ? (
        <Part id="ledger" title="What the ledger said" question="The lead ledger's own scores and the lawful basis it was imported under. These are the ledger's word, not a measurement.">
          <table className={styles.ledger}>
            <tbody>
              <tr><th scope="row">Tier</th><td>{imported.tier}</td></tr>
              <tr><th scope="row">Score</th><td>{imported.score ?? "Not given"}</td></tr>
              <tr><th scope="row">Fit, signal, reach, engagement</th><td>{[imported.fit, imported.signal, imported.reach, imported.engagement].map((value) => value ?? "Not given").join(", ")}</td></tr>
              <tr><th scope="row">Import batch</th><td>{imported.batch}</td></tr>
              <tr><th scope="row">Lawful basis</th><td>{imported.lawful_basis.replace(/_/g, " ")}: {imported.lawful_basis_note}</td></tr>
              {imported.detail && Object.keys(imported.detail).length > 0 ? <tr><th scope="row">The ledger&apos;s other fields</th><td>{details(imported.detail)}</td></tr> : null}
            </tbody>
          </table>
        </Part>
      ) : null}

      <Part id="timeline" title="Timeline" question="What named this person, and what their proved wallets did, newest first. Only the chain says what settled.">
        {timeline.length === 0 ? <Empty>Nothing has happened on this person&apos;s record yet.</Empty> : (
          <table className={styles.ledger}>
            <thead><tr><th scope="col">When</th><th scope="col">Whose word</th><th scope="col">Event</th><th scope="col">Wallet</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {timeline.map((event, index) => (
                <tr key={`${event.occurred_at}-${index}`} data-source={event.source}>
                  <th scope="row">{utc(event.occurred_at)}</th>
                  <td>{sourceNames[event.source] ?? event.source}</td>
                  <td>{event.type}</td>
                  <td title={event.wallet}>{event.wallet ? shortAddress(event.wallet) : "None"}</td>
                  <td>{details(event.properties)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {identities.some((identity) => identity.kind === "wallet" && !identity.verified) ? (
          <p className={styles.absence}>A wallet only a ledger claimed is listed above, but its activity is not shown here until the person proves it.</p>
        ) : null}
      </Part>
    </article>
  );
}
