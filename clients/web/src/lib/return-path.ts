// Where sign-in sends a visitor back to. Only a path on this site is ever
// returned: a full URL, a protocol-relative "//host" or a backslash form a
// browser reads as one would turn the sign-in page into an open redirect.
const origin = "https://return-path.invalid";

export function safeReturnPath(raw: string | undefined): string | undefined {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || /[\\\s]/.test(raw)) return undefined;
  // Decoding catches an encoded "//" that a later decode would turn into a
  // host; the URL parse confirms the path still names this origin.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  if (decoded.startsWith("//") || /[\\\s]/.test(decoded)) return undefined;
  const parsed = new URL(raw, origin);
  return parsed.origin === origin ? `${parsed.pathname}${parsed.search}${parsed.hash}` : undefined;
}
