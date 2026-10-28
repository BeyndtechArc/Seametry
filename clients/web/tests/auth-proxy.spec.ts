import { expect, test } from "@playwright/test";

// tests/terminal-api-fixture.mjs answers /api/auth/get-session gzipped, as
// Caddy does in front of the auth service. fetch in the proxy decodes it, so
// passing the upstream Content-Encoding on would label a plain body as gzip.
test("the account proxy returns a body its own headers describe", async ({ request }) => {
  const response = await request.get("/api/auth/get-session", { headers: { "Accept-Encoding": "gzip" } });

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ session: null, served_by: "fixture" });
});

test("the account proxy keeps every cookie and drops the upstream connection's headers", async ({ request }) => {
  const response = await request.get("/api/auth/get-session", { headers: { "Accept-Encoding": "identity" } });
  const headers = response.headersArray().map(({ name, value }) => ({ name: name.toLowerCase(), value }));

  expect(response.status()).toBe(200);
  expect(headers.filter(({ name }) => name === "set-cookie").map(({ value }) => value)).toEqual([
    "fixture-a=1; Path=/; HttpOnly",
    "fixture-b=2; Path=/; HttpOnly",
  ]);
  expect(headers.filter(({ name }) => name === "x-fixture-hop" || name === "content-encoding")).toEqual([]);
  const length = headers.find(({ name }) => name === "content-length");
  if (length) expect(Number(length.value)).toBe((await response.body()).length);
});

// Better Auth needs the session cookie, the body's type, and the origin,
// referer and fetch-metadata fields its CSRF check reads; the user agent is
// kept on the session it writes. Nothing a browser says about addresses,
// hosts or other credentials is the auth service's to trust.
test("the account proxy forwards only the headers Better Auth reads, never X-Forwarded-* or Authorization", async ({ request }) => {
  const forwarded = {
    cookie: "better-auth.session_token=fixture-member",
    "content-type": "application/json",
    origin: "http://localhost:3847",
    referer: "http://localhost:3847/sign-in",
    "user-agent": "fixture-browser/1.0",
    "sec-fetch-site": "same-origin",
    "sec-fetch-dest": "empty",
  };
  const dropped = {
    authorization: "Bearer stolen-elsewhere",
    "x-forwarded-for": "198.51.100.7",
    "x-forwarded-host": "evil.example",
    "x-forwarded-proto": "http",
    "x-real-ip": "198.51.100.7",
    forwarded: "for=198.51.100.7;host=evil.example",
    "x-custom-origin": "https://evil.example",
    "x-fixture-anything": "else",
  };
  const response = await request.post("/api/auth/fixture-echo-headers", { headers: { ...forwarded, ...dropped }, data: { probe: 1 } });
  expect(response.status()).toBe(200);
  const echoed = (await response.json()) as { headers: Record<string, string>; body: string };
  for (const [name, value] of Object.entries(forwarded)) expect(echoed.headers[name], name).toBe(value);
  for (const name of Object.keys(dropped)) expect(echoed.headers[name], name).toBeUndefined();
  expect(Object.keys(echoed.headers).filter((name) => name.startsWith("x-forwarded-"))).toEqual([]);
  expect(JSON.parse(echoed.body)).toEqual({ probe: 1 });
});
