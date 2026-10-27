import "server-only";

const fallbackOrigin = "https://api.seametry.xyz";

// RFC 9110 section 7.6.1: these describe the connection to the auth service,
// not the one to the browser, so they stop here.
const hopByHopHeaders = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];
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
  const headers = new Headers(request.headers);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");

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
