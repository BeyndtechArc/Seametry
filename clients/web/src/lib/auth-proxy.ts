import "server-only";

const fallbackOrigin = "https://api.seametry.xyz";

function authOrigin() {
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
      headers: response.headers,
    });
  } catch {
    return Response.json(
      { error: "Account service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
