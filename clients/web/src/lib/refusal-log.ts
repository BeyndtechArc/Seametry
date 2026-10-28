// A Gateway refusal is logged by reason and a reference, never by what the
// holder typed: an older Gateway repeated the refused address in its detail,
// and server logs are kept longer and read wider than a holder's own request.
// The reference goes back in the answer so a support question can find the
// one log line without anyone reading the address aloud.

const ADDRESS_LIKE = /[^\s"'<>]+@[^\s"'<>]+/g;

export function scrubAddresses(text: string): string {
  return text.replace(ADDRESS_LIKE, "[address]");
}

export async function logRefusal(what: string, response: Response): Promise<string> {
  const reference = crypto.randomUUID();
  const body = await response.text();
  let reason = body;
  try {
    const problem = JSON.parse(body) as { detail?: unknown; title?: unknown };
    if (typeof problem.detail === "string") reason = problem.detail;
    else if (typeof problem.title === "string") reason = problem.title;
  } catch {
    // Not a problem document; the scrubbed raw text is still the best reason.
  }
  console.warn(`${what} refused by the Gateway (reference ${reference}): ${scrubAddresses(reason).slice(0, 300)}`);
  return reference;
}
