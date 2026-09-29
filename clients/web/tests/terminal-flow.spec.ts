import { expect, test } from "@playwright/test";

const mint = "XsTockMint111111111111111111111111111111111";
const servedAt = "2026-09-29T12:00:17Z";
const capturedAt = "2026-09-29T12:00:00Z";

const instrument = {
  mint,
  symbol: "XSTK",
  grade: "Certificate",
  prerogatives: [
    { sentence: "The issuer can freeze an account holding this instrument." },
    { sentence: "The issuer can pause movement of this instrument." },
  ],
  unknown_extensions: [91],
  capture: {
    slot: "371991204",
    commitment: "confirmed",
    captured_at: capturedAt,
  },
};

const meta = {
  served_at: servedAt,
  as_of: servedAt,
  completeness: "complete",
  cluster: "mainnet",
};

test("the Terminal moves from the instrument register into one assay", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/terminal/instruments", async (route) => {
    await route.fulfill({ json: { data: [instrument], meta } });
  });
  await page.route(`**/api/terminal/instruments/${mint}`, async (route) => {
    await route.fulfill({
      json: {
        instrument: { data: instrument, meta },
        admissibility: {
          data: {
            decision: "BLOCK",
            reasons: [{ code: "UNKNOWN_EXTENSION", severity: "BLOCK", fact: "Extension 91 is not decoded." }],
            policy_version: "policy-2026.09.2",
            input_digest: "047d10ac031522499c5743457489566932288415e96009e380b2fb18a981e109",
          },
          meta,
        },
        depth: {
          data: {
            reference_index: 0,
            points: [
              {
                size: { atoms: "10000000", scale: 6 },
                availability: "available",
                provider_code: "jupiter",
                shortfall_bps: 35,
                received_at: capturedAt,
                expires_at: servedAt,
                age_seconds: 17,
              },
              { size: { atoms: "25000000", scale: 6 }, availability: "unavailable", provider_code: "no_route" },
            ],
          },
          meta: { ...meta, completeness: "partial", missing: [{ part: "depth.sell", state: "unavailable", reason: "SELL_DEPTH_NOT_MEASURED" }] },
        },
      },
    });
  });

  const registerRequest = page.waitForRequest((request) => request.url().endsWith("/api/terminal/instruments"));
  await page.goto("/terminal");
  await registerRequest;
  expect(browserErrors).toEqual([]);
  await expect(page.getByRole("heading", { level: 1, name: "Instrument desk" })).toBeVisible();
  const row = page.getByRole("row", { name: /XSTK/ });
  await expect(row).toContainText("Certificate");
  await row.getByRole("link", { name: "Open assay" }).click();

  await expect(page).toHaveURL(`/terminal/instruments/${mint}`);
  await expect(page.getByRole("heading", { level: 1, name: "XSTK" })).toBeVisible();
  await expect(page.getByText("BLOCK", { exact: true })).toBeVisible();
  await expect(page.getByText("policy-2026.09.2", { exact: true })).toBeVisible();
  await expect(page.getByText("Extension 91 is not decoded.", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /10\.000000 USDC/ })).toContainText("35 bps");
  await expect(page.getByRole("row", { name: /25\.000000 USDC/ })).toContainText("No route");
  await expect(page.getByText("SELL_DEPTH_NOT_MEASURED", { exact: true })).toBeVisible();
});

test("the Terminal names the API boundary when no deployment is connected", async ({ page }) => {
  await page.route("**/api/terminal/instruments", async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        title: "Terminal API unavailable",
        detail: "Set SEAMETRY_API_URL to a deployed or local Gateway.",
        status: 503,
      },
    });
  });
  await page.goto("/terminal");

  await expect(page.getByRole("heading", { level: 1, name: "Instrument desk" })).toBeVisible();
  await expect(page.getByText("Terminal API unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Set SEAMETRY_API_URL to a deployed or local Gateway.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect Alloy 01" })).toHaveAttribute("href", "/terminal/alloys/storm");
  await expect(page.getByRole("link", { name: "Return to public site" })).toHaveAttribute("href", "/");
});

test("the Terminal distinguishes an empty persisted register from an unavailable Gateway", async ({ page }) => {
  await page.goto("/terminal");
  await expect(page.getByText("No persisted instruments", { exact: true })).toBeVisible();
  await expect(page.getByText("The Gateway answered with an empty instrument register as of Sep 29, 2026, 12:00 PM UTC.", { exact: true })).toBeVisible();
  await expect(page.getByText("Terminal API unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Inspect Alloy 01" })).toHaveAttribute("href", "/terminal/alloys/storm");
});
