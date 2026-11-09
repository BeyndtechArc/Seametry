// The names the Admin reads out for Growth's codes, so the people list and
// one person's page cannot name a stage two ways. An unknown code is shown
// as itself, never mapped to a known one.

export const stageNames: Record<string, string> = {
  lead: "Lead", visitor: "Visitor", connected: "Connected", preflighted: "Preflighted",
  allocated: "Allocated", repeat: "Repeat", ap: "AP", advocate: "Advocate",
};

export const outreachNames: Record<string, string> = {
  not_contacted: "Not contacted", sent: "Sent", replied: "Replied", call_booked: "Call booked",
  testing: "Testing", customer: "Customer", pass: "Pass",
};

/** Whose word an identity is: proved by an account token or a signed message, or only a ledger's claim. */
export const provenanceNames: Record<string, string> = {
  account_token: "Proved by sign-in", signed_message: "Proved by a signed message", import: "A ledger's claim",
};

export type PeopleQuery = Partial<Record<"stage" | "outreach_status" | "created_from" | "tier" | "q", string>>;

export function peopleHref(query: PeopleQuery, cursor?: string): string {
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
  if (cursor) search.set("cursor", cursor);
  const rendered = search.toString();
  return `/admin/people${rendered ? `?${rendered}` : ""}`;
}
