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
