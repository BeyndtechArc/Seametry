import "server-only";

const fallbackOrigin = "https://api.seametry.xyz";

// RFC 9110 section 7.6.1: these describe the connection to the auth service,
// not the one to the browser, so they stop here.
const hopByHopHeaders = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];
// The only request headers that reach the auth service. Better Auth reads
// the session cookie, the body's type, and origin, referer and fetch
// metadata for its CSRF check (better-auth 1.7 origin-check), and keeps the
// user agent on the session it writes. Everything else stops here: the
// browser's word on X-Forwarded-*, Forwarded or X-Real-IP is not this
// service's to pass on, and an Authorization header would be a second
// credential beside the cookie the auth service never asked for.
const forwardedRequestHeaders = ["accept", "content-type", "cookie", "origin", "referer", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "user-agent"];
// Headers.delete throws on a name outside the RFC 9110 token grammar, which
// would turn a malformed Connection value into a 503 for the whole request.
const headerName = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export function authOrigin() {
  const value = (process.env.SEAMETRY_AUTH_ORIGIN ?? process.env.SEAMETRY_API_URL ?? fallbackOrigin).trim();
  const origin = new URL(value);
  if (!/^https?:$/.test(origin.protocol) || origin.pathname !== "/") {
    throw new Error("SEAMETRY_AUTH_ORIGIN must be an HTTP(S) origin without a path.");
  }
  return origin;
}

export function accountServiceConfigured() {
  // The Gateway and the account authority are separate services. A reachable
  // Gateway does not prove that sign-in is configured, and treating its URL as
  // that proof makes the client call auth routes that may not exist there.
  return Boolean(process.env.SEAMETRY_AUTH_ORIGIN);
}

export type AccountToken = { token: string } | { signedOut: true } | { unavailable: string };

/**
 * Exchanges the visitor's session cookie for the account authority's
 * short-lived token, on the server only. The token is handed to the Gateway
 * and never to the browser.
 */
export async function exchangeAccountToken(cookie: string): Promise<AccountToken> {
  try {
    const issued = await fetch(new URL("/api/auth/token", authOrigin()), { headers: { cookie }, cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (issued.status === 401) return { signedOut: true };
    if (!issued.ok) return { unavailable: `The account service answered ${issued.status} for a token.` };
    const body = (await issued.json()) as { token?: unknown };
    return typeof body.token === "string" ? { token: body.token } : { signedOut: true };
  } catch {
    return { unavailable: "The account service could not be reached." };
  }
}

function browserResponseHeaders(upstream: Headers) {
  const headers = new Headers(upstream);
  const namedByConnection = (upstream.get("connection") ?? "").split(",").map((name) => name.trim()).filter((name) => headerName.test(name));
  for (const name of [...hopByHopHeaders, ...namedByConnection]) headers.delete(name);
  // fetch has already decoded the body, so the upstream encoding and length
  // describe bytes this response no longer carries. Caddy compresses auth
  // responses; a plain body still labelled gzip or zstd fails in the browser.
  headers.delete("content-encoding");
  headers.delete("content-length");
  return headers;
}

/**
 * Preserve a first-party browser boundary while the auth authority runs on the
 * Oracle host. No authentication decision is made in this Vercel function.
 */
export async function proxyAccountRequest(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, authOrigin());
  const headers = new Headers();
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: browserResponseHeaders(response.headers),
    });
  } catch {
    return Response.json(
      { error: "Account service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
