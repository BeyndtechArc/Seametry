import { expect, test } from "@playwright/test";
import { acquisitionQuoteIndex, ROUTE_SAMPLE_USDC_ATOMS, type RouteObservation } from "../src/lib/market/route-observations";

const now = Date.parse("2026-10-11T18:00:00.000Z");
const mk = (mint: string, day: string, tokens: string, overrides: Partial<RouteObservation> = {}): RouteObservation => ({
  schema: "seametry-route-observation-v1",
  mint,
  symbol: mint,
  utcDay: day,
  sampledAt: day + "T12:00:00.000Z",
  inputUsdcAtoms: ROUTE_SAMPLE_USDC_ATOMS.toString(),
  outputTokenAtoms: tokens,
  decimals: 6,
  contextSlot: 123,
  route: ["Jupiter fixture"],
  issuer: "Fixture issuer",
  admissionDigest: "test-evidence",
  ...overrides,
});

test("a fixed-quantity quote index is based on complete dates and starts at 100", () => {
  const histories = {
    A: [mk("A", "2026-10-09", "10000000"), mk("A", "2026-10-10", "5000000")],
    B: [mk("B", "2026-10-09", "10000000"), mk("B", "2026-10-10", "20000000")],
  };
  expect(acquisitionQuoteIndex(["A", "B"], histories, now)).toEqual([
    { time: Date.parse("2026-10-09T00:00:00Z") / 1000, close: 100 },
    { time: Date.parse("2026-10-10T00:00:00Z") / 1000, close: 125 },
  ]);
});

test("an incomplete constituent date cannot create a misleading partial curve", () => {
  const histories = {
    A: [mk("A", "2026-10-09", "10000000"), mk("A", "2026-10-10", "5000000"), mk("A", "2026-10-11", "4000000")],
    B: [mk("B", "2026-10-09", "10000000"), mk("B", "2026-10-11", "20000000")],
  };
  const curve = acquisitionQuoteIndex(["A", "B"], histories, now);
  expect(curve).toHaveLength(2);
  expect(curve[1].time).toBe(Date.parse("2026-10-11T00:00:00Z") / 1000);
  expect(curve.some((point) => point.time === Date.parse("2026-10-10T00:00:00Z") / 1000)).toBe(false);
});

test("one day, no legs, or duplicate mints is never presented as history", () => {
  const onlyOne = { A: [mk("A", "2026-10-10", "10000000")] };
  expect(acquisitionQuoteIndex(["A"], onlyOne, now)).toEqual([]);
  expect(acquisitionQuoteIndex([], onlyOne, now)).toEqual([]);
  expect(acquisitionQuoteIndex(["A", "A"], onlyOne, now)).toEqual([]);
});

test("wrong quote size, malformed amount, future or stale observations are rejected", () => {
  const base = mk("A", "2026-10-09", "10000000");
  const bad = [
    mk("A", "2026-10-10", "5000000", { inputUsdcAtoms: "1000000" }),
    mk("A", "2026-10-10", "NaN"),
    mk("A", "2026-10-12", "1000000"),
    mk("A", "2026-01-01", "1000000"),
    mk("B", "2026-10-10", "1000000"),
  ];
  expect(acquisitionQuoteIndex(["A"], { A: [base, ...bad] }, now)).toEqual([]);
});

test("the latest valid observation per UTC day wins", () => {
  const a = [
    mk("A", "2026-10-09", "10000000"),
    mk("A", "2026-10-10", "5000000"),
    mk("A", "2026-10-10", "2500000", { sampledAt: "2026-10-10T19:00:00.000Z" }),
  ];
  const result = acquisitionQuoteIndex(["A"], { A: a }, now);
  expect(result.map((point) => point.close)).toEqual([100, 400]);
});

test("a basket uses raw constituent units, never an external equity ticker's price", () => {
  const histories = {
    "Mint-A": [mk("Mint-A", "2026-10-09", "30000000"), mk("Mint-A", "2026-10-10", "30000000")],
  };
  expect(acquisitionQuoteIndex(["Mint-A"], histories, now).map((point) => point.close)).toEqual([100, 100]);
});

test("an unsigned public request cannot initiate a sampling run", async ({ request }) => {
  const response = await request.get("/api/market/observe");
  expect([401, 503]).toContain(response.status());
  expect(await response.text()).not.toContain("recorded");
});

test("the catalogue is a compact single-link register; unavailable history stays on details", async ({ page }) => {
  await page.route("**/api/market/index-history?**", (route) =>
    route.fulfill({ status: 200, json: { available: false, source: "Jupiter quote history", reason: "No complete observations yet." } }),
  );
  await page.goto("/app/baskets");
  await expect(page.getByRole("heading", { level: 1, name: "Baskets" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Published baskets" })).toBeVisible();
  const register = page.getByRole("list", { name: "Published basket register" });
  await expect(register.locator("li")).toHaveCount(10);
  const prime = register.getByRole("link", { name: "Prime Seven" });
  await expect(prime).toHaveAttribute("href", "/app/baskets/prime-seven");
  await expect(prime.getByText("Megacap technology")).toBeVisible();
  await expect(register.getByText("Open basket")).toHaveCount(0);
  await expect(register.getByText("No routed history yet")).toHaveCount(0);
  await prime.click();
  await expect(page.getByRole("heading", { level: 1, name: "Prime Seven" })).toBeVisible();
  await expect(page.getByText("No routed history yet")).toBeVisible();
});

test("published baskets stay on their details page for checkout, without repeating constituent selection", async ({ page }) => {
  await page.goto("/app/baskets/prime-seven");
  await expect(page.getByRole("link", { name: "Build this basket" })).toHaveCount(0);
  await page.getByRole("link", { name: "Buy basket" }).click();
  const order = page.getByRole("region", { name: "Buy Prime Seven" });
  await expect(order.getByLabel("USDC to spend")).toBeVisible();
  await expect(order.getByRole("heading", { name: "Buy Prime Seven" })).toBeVisible();
  await expect(order.getByRole("list", { name: "Allocation steps" })).toHaveCount(0);
  await expect(order.getByRole("region", { name: "Choose the constituents" })).toHaveCount(0);
  await expect(order.getByText("Ready to assemble")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Build a different basket" })).toHaveAttribute("href", "/app/baskets/build");
});

test("on mobile the overflow navigation and filter categories stay behind controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/baskets");
  const menuButton = page.getByRole("button", { name: "Open more navigation" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.getByRole("complementary", { name: "More navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).last().click();
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Basket filters" })).toBeVisible();
  await page.getByRole("button", { name: "Backpack" }).click();
  await expect(page.getByText(/Showing \d+ of \d+ baskets · Backpack/)).toBeVisible();
});
