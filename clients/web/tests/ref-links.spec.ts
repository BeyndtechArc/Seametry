import { expect, test, type APIRequestContext } from "@playwright/test";
import { admissions } from "../src/lib/allocation/admissions";
import { recordedRef, refCode, refLocation, refTarget } from "../src/lib/ref-link";
import { registerTestWallet } from "./test-wallet";
import { TEST_WALLET } from "./execution-fixture";

type Report = { kind: string; body: Record<string, unknown> };

async function reports(request: APIRequestContext): Promise<Report[]> {
  return (await request.get("http://127.0.0.1:3846/fixture/activity")).json();
}

test("a ref code is a short lowercase slug, and only listed channels and dm-<handle> are kept as written", () => {
  expect(refCode("x")).toBe("x");
  expect(refCode(" TG ")).toBe("tg");
  expect(refCode("dm-storm_01")).toBe("dm-storm_01");
  expect(refCode("r".repeat(40))).toBe("r".repeat(40));
  for (const malformed of ["", "r".repeat(41), "-x", "_x", "x.com", "x/y", "x?y", "x y", "%2F", "dm-é", "<script>"]) {
    expect(refCode(malformed), malformed).toBeUndefined();
  }

  for (const listed of ["x", "tg", "discord", "dm", "X", "dm-storm_01", "dm-a"]) expect(recordedRef(listed), listed).toBe(listed.toLowerCase());
  for (const unlisted of ["k7x2", "telegram", "dm-", "dm-a-b", "dm-" + "a".repeat(38), "x.com", "", "r".repeat(41), "dm-<b>"]) {
    expect(recordedRef(unlisted), unlisted).toBe("unknown");
  }
});

test("a ref link lands only on a listed same-origin path, whatever `to` says", () => {
  expect(refTarget(null)).toBe("/");
  expect(refTarget(undefined)).toBe("/");
  expect(refTarget("/app/allocation")).toBe("/app/allocation");
  expect(refTarget("/thesis")).toBe("/thesis");
  for (const hostile of ["//evil.com", "https://evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "/app/allocation?x=1", "/app/allocation/", "/APP", "/app/../evil", " /app", "evil.com", "/r/x"]) {
    expect(refTarget(hostile), hostile).toBe("/");
  }
  expect(refLocation("dm-storm", "/app/allocation")).toBe("/app/allocation?ref=dm-storm");
  expect(refLocation("whatever", "//evil.com")).toBe("/?ref=unknown");
});

test("/r/{code} answers 302 to a same-origin path with the code, and sets no cookie", async ({ request }) => {
  const cases: [string, string][] = [
    ["/r/x", "/?ref=x"],
    ["/r/discord?to=/app/allocation", "/app/allocation?ref=discord"],
    ["/r/dm-storm_01?to=/thesis", "/thesis?ref=dm-storm_01"],
    ["/r/k7x2", "/?ref=unknown"],
    ["/r/x?to=//evil.com", "/?ref=x"],
    ["/r/x?to=https%3A%2F%2Fevil.com", "/?ref=x"],
    ["/r/%2F%2Fevil.com", "/?ref=unknown"],
    [`/r/${"x".repeat(200)}`, "/?ref=unknown"],
  ];
  for (const [path, location] of cases) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(302);
    expect(response.headers()["location"], path).toBe(location);
    expect(response.headers()["set-cookie"], path).toBeUndefined();
  }
});

test("a first quote after /r/x carries ref_code x in its first touch, and a later ref link does not replace it", async ({ page, request }) => {
  await registerTestWallet(page, { trusted: true });
  const lot = admissions.instruments.find((entry) => entry.instrument.symbol === "AAPLx")!;
  // A purchase this browser kept, so Holdings offers a sale whose prepare
  // request is the wallet's first quote. The prepare route itself is not
  // stubbed: the report the fixture Gateway receives is the one the real
  // route built from what the browser sent.
  await page.addInitScript((trade) => {
    if (!localStorage.getItem("seametry:executions:v1")) localStorage.setItem("seametry:mainnet-allocation-activity:v1", JSON.stringify([trade]));
  }, {
    signature: "1".repeat(88), wallet: TEST_WALLET, mint: lot.instrument.mint, symbol: lot.instrument.symbol!, direction: "buy",
    inputAtoms: "1000000", inputScale: 6, submittedAt: new Date(Date.now() - 60_000).toISOString(),
    allocationId: "ref-allocation", allocationName: "Ref Seven", allocationTemplateId: "prime-seven",
    settled: true, settledAtoms: "400000", settledScale: lot.decimals,
  });
  await page.route("**/api/allocation/positions?**", (route) => route.fulfill({ json: {
    wallet: TEST_WALLET, network: "mainnet", source: "Solana mainnet RPC", observedAt: new Date().toISOString(), outsideRegister: 0,
    positions: [{ mint: lot.instrument.mint, symbol: lot.instrument.symbol, atoms: "900000", sellableAtoms: "900000", scale: lot.decimals, tokenProgram: lot.token_program }],
  } }));

  await page.goto("/r/x");
  await expect(page).toHaveURL(/\/\?ref=x$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("seametry:first-touch"))).not.toBeNull();
  // The first touch is kept; a second ref link in the same browser changes nothing.
  await page.goto("/r/tg");
  await expect(page).toHaveURL(/\/\?ref=tg$/);
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem("seametry:first-touch")))!);
  expect(stored).toEqual({ landing_path: "/", ref_code: "x" });
  expect((await page.context().cookies()).filter((cookie) => /ref|touch/i.test(cookie.name))).toEqual([]);

  const prepared = page.waitForRequest("**/api/allocation/sell/prepare");
  await page.goto("/app/positions");
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("tab", { name: /^Allocations/ }).click();
  await page.getByRole("button", { name: "Sell Ref Seven" }).click();
  await page.getByRole("dialog", { name: "Sell Ref Seven" }).getByRole("button", { name: "Review sell all" }).click();
  expect((await prepared).postDataJSON().firstTouch).toEqual({ landing_path: "/", ref_code: "x" });

  const fromThisBrowser = (entry: Report) => entry.kind === "quotes" && (entry.body.first_touch as { ref_code?: string } | undefined)?.ref_code === "x";
  await expect.poll(async () => (await reports(request)).filter(fromThisBrowser)).toHaveLength(1);
  const [report] = (await reports(request)).filter(fromThisBrowser);
  expect(report.body).toMatchObject({ wallet: TEST_WALLET, kind: "sell", first_touch: { landing_path: "/", ref_code: "x" } });
});
