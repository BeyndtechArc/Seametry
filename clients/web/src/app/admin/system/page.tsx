import { adminSection, type AdminSystem } from "@/lib/admin";
import { AdminHeader, Empty, Part, Unavailable, admitted, age, sourceNames, utc, recordStyles as styles } from "../_record/record";

export const dynamic = "force-dynamic";

// Each part is shown by when it last moved, as a time and an age. Nothing
// here says a part is working: a stalled reader shows as an old time, and the
// reader judges what old means for it.

const originNames: Record<string, string> = {
  "execution.outbox": "Trades into the timeline, from the execution outbox",
  "hall.devnet": "The Hall program on devnet",
  "hall.mainnet": "The Hall program on mainnet",
};

const deliveryNames: Record<string, string> = {
  pending: "Not sent yet", delivered: "Delivered", failed: "Failed", not_configured: "No mail server configured",
};

export default async function AdminSystemPage() {
  const access = await admitted();
  const read = await adminSection<AdminSystem>(access, "system", new URLSearchParams());
  if (read.state !== "read") {
    return (
      <article className={styles.page}>
        <AdminHeader title="System" />
        <Unavailable detail={read.detail} />
      </article>
    );
  }
  const system = read.data;
  const now = Date.parse(read.readAt);
  const when = (iso: string | undefined, never: string) => (iso ? `${utc(iso)}, ${age(iso, now)}` : never);

  return (
    <article className={styles.page}>
      <AdminHeader title="System">Whether the record is still moving, across every deployment. Read from the Gateway at {utc(read.readAt)}.</AdminHeader>

      <Part id="record" title="The record" question="When the chain last answered for a trade, and what still waits for an answer.">
        <table className={styles.ledger}>
          <tbody>
            <tr><th scope="row">The reconciler last wrote a chain answer</th><td>{when(system.last_reconciled_at, "Never yet")}</td></tr>
            <tr><th scope="row">Legs sent with no chain answer yet</th><td>{system.unanswered_legs}</td></tr>
            <tr><th scope="row">The oldest of them was submitted</th><td>{when(system.oldest_unanswered_at, "None waits")}</td></tr>
            <tr><th scope="row">The execution outbox last grew</th><td>{when(system.outbox_written_at, "Never: it is empty")}</td></tr>
          </tbody>
        </table>
      </Part>

      <Part id="readers" title="Growth's readers" question="Where each reader of the outbox and of the chain last moved to.">
        {system.projections.length + system.chain_readers.length === 0 ? <Empty>No reader has moved yet. The first trade or Hall transaction read starts one.</Empty> : (
          <table className={styles.ledger}>
            <thead><tr><th scope="col">Reader</th><th scope="col">Last moved</th><th scope="col">Read to slot</th></tr></thead>
            <tbody>
              {[...system.projections, ...system.chain_readers].map((reader) => (
                <tr key={reader.origin}>
                  <th scope="row" title={reader.origin}>{originNames[reader.origin] ?? reader.origin}</th>
                  <td>{when(reader.advanced_at, "Never")}</td>
                  <td>{reader.last_slot ?? "Not a chain reader"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>

      <Part id="timeline" title="The timeline" question="What the people timeline holds, by whose word, and when each kind last arrived.">
        {system.events.length === 0 ? <Empty>The timeline holds no event yet.</Empty> : (
          <table className={styles.ledger}>
            <thead><tr><th scope="col">Whose word</th><th scope="col">Events</th><th scope="col">Newest happened</th><th scope="col">Newest arrived</th></tr></thead>
            <tbody>
              {system.events.map((source) => (
                <tr key={source.source}>
                  <th scope="row">{sourceNames[source.source] ?? source.source}</th>
                  <td>{source.events}</td>
                  <td>{when(source.newest_occurred_at, "Never")}</td>
                  <td>{when(source.newest_received_at, "Never")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>

      <Part id="known" title="Who the record knows" question="People by where they came from, and site entries in the last week.">
        <table className={styles.ledger}>
          <tbody>
            {system.people.length === 0 ? <tr><th scope="row">People</th><td>None yet</td></tr> : system.people.map((origin) => (
              <tr key={origin.created_from}><th scope="row">{origin.created_from === "import" ? "From a lead ledger" : origin.created_from === "signup" ? "From signing in" : origin.created_from}</th><td>{origin.people}</td></tr>
            ))}
            <tr><th scope="row">Site entries since {system.entries_since}, no visitor told from another</th><td>{system.entries}</td></tr>
            <tr><th scope="row">The newest day with an entry</th><td>{system.newest_entry_on ?? "None in the week"}</td></tr>
          </tbody>
        </table>
      </Part>

      <Part id="mail" title="Mail to the team" question="Feedback and notices by whether each mail arrived. Every one is kept before it is sent, so a failed send is counted here, not lost.">
        {system.mail.length === 0 ? <Empty>No feedback or notice has been kept yet.</Empty> : (
          <table className={styles.ledger}>
            <thead><tr><th scope="col">Mail</th><th scope="col">Delivery</th><th scope="col">Mails</th><th scope="col">Newest kept</th><th scope="col">Newest delivered</th></tr></thead>
            <tbody>
              {system.mail.map((mail) => (
                <tr key={`${mail.kind}-${mail.delivery}`}>
                  <th scope="row">{mail.kind === "feedback" ? "Feedback" : "Notices"}</th>
                  <td>{deliveryNames[mail.delivery] ?? mail.delivery}</td>
                  <td>{mail.mails}</td>
                  <td>{when(mail.newest_at, "Never")}</td>
                  <td>{when(mail.newest_delivered_at, "None delivered")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Part>
    </article>
  );
}
