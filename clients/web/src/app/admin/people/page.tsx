import Link from "next/link";
import { adminSection, type AdminPeople } from "@/lib/admin";
import { AdminHeader, Empty, Part, Unavailable, admitted, dayOf, utc, recordStyles as styles } from "../_record/record";
import { outreachNames, peopleHref, stageNames, type PeopleQuery } from "./people";

export const dynamic = "force-dynamic";

const filterKeys = ["stage", "outreach_status", "created_from", "tier", "q"] as const;

export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await admitted();
  const raw = await searchParams;
  const query: PeopleQuery = {};
  for (const key of filterKeys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) query[key] = value.trim();
  }
  const cursor = typeof raw.cursor === "string" ? raw.cursor : undefined;
  const parameters = new URLSearchParams(query);
  if (cursor) parameters.set("cursor", cursor);
  const read = await adminSection<AdminPeople>(access, "people", parameters);
  const filtered = filterKeys.some((key) => query[key]);

  return (
    <article className={styles.page}>
      <AdminHeader title="People">{read.state === "read" ? `Everyone Growth knows of, newest change first. Read from the Gateway at ${utc(read.readAt)}.` : null}</AdminHeader>

      <form className={styles.range} method="get" action="/admin/people">
        <label>
          <span>Name, handle or wallet</span>
          <input type="search" name="q" defaultValue={query.q} autoComplete="off" />
        </label>
        <label>
          <span>Stage</span>
          <select name="stage" defaultValue={query.stage ?? ""}>
            <option value="">Any stage</option>
            {Object.entries(stageNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>
          <span>Outreach</span>
          <select name="outreach_status" defaultValue={query.outreach_status ?? ""}>
            <option value="">Any outreach</option>
            {Object.entries(outreachNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
        <label>
          <span>Came from</span>
          <select name="created_from" defaultValue={query.created_from ?? ""}>
            <option value="">Anywhere</option>
            <option value="import">A lead ledger</option>
            <option value="signup">Signing in</option>
          </select>
        </label>
        <label>
          <span>Ledger tier</span>
          <input type="text" name="tier" defaultValue={query.tier} placeholder="P1" size={4} autoComplete="off" />
        </label>
        <button type="submit" className={styles.read}>Read the people</button>
      </form>

      {read.state === "read" && read.data.stages.length > 0 ? (
        <Part id="stages" title="By stage" question="Everyone at each stage, whatever the filters above.">
          <table className={styles.ledger}>
            <thead><tr><th scope="col">Stage</th><th scope="col">People</th></tr></thead>
            <tbody>
              {read.data.stages.map((stage) => (
                <tr key={stage.stage}>
                  <th scope="row"><Link className={styles.rowLink} href={peopleHref({ stage: stage.stage })}>{stageNames[stage.stage] ?? stage.stage}</Link></th>
                  <td>{stage.people}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Part>
      ) : null}

      <Part id="people" title="People" question="Who matches, with where they came from and how far they have gone.">
        {read.state !== "read" ? <Unavailable detail={read.detail} /> : read.data.people.length === 0 ? (
          <Empty>{filtered ? "Nobody matches these filters. Clear one to widen the list." : "Growth knows of nobody yet. People arrive when they sign in, or when a lead ledger is imported."}</Empty>
        ) : (
          <>
            <p className={styles.absence}>{read.data.people.length} of {read.data.total} people, newest change first</p>
            <table className={styles.ledger}>
              <thead>
                <tr>
                  <th scope="col">Name</th><th scope="col">Stage</th><th scope="col">Outreach</th><th scope="col">Came from</th>
                  <th scope="col">Ledger tier</th><th scope="col">Ledger score</th><th scope="col">X</th><th scope="col">Wallets</th><th scope="col">Proved</th><th scope="col">Changed</th>
                </tr>
              </thead>
              <tbody>
                {read.data.people.map((person) => (
                  <tr key={person.id}>
                    <th scope="row"><Link className={styles.rowLink} href={`/admin/people/${person.id}`}>{person.display_name}</Link></th>
                    <td>{stageNames[person.stage] ?? person.stage}</td>
                    <td>{outreachNames[person.outreach_status] ?? person.outreach_status}</td>
                    <td>{person.created_from === "import" ? "Ledger" : "Sign-in"}</td>
                    <td>{person.imported_tier ?? "None"}</td>
                    <td>{person.imported_score ?? "None"}</td>
                    <td>{person.x_handle ? `@${person.x_handle}` : "None"}</td>
                    <td>{person.wallets}</td>
                    <td>{person.verified ? "Yes" : "No, claimed only"}</td>
                    <td>{dayOf(person.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <nav className={styles.pages} aria-label="People pages">
              {cursor ? <a href={peopleHref(query)}>Newest people</a> : null}
              {read.data.next_cursor ? <a href={peopleHref(query, read.data.next_cursor)}>Older people</a> : null}
            </nav>
          </>
        )}
      </Part>
    </article>
  );
}
