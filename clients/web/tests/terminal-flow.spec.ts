import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { registerTestWallet } from "./test-wallet";

const mint = "XsTockMint111111111111111111111111111111111";
const servedAt = "2026-09-29T12:00:17Z";
const capturedAt = "2026-09-29T12:00:00Z";
const alloyAddress = "6BD6PprLyhiLeXKTAiLRA2hyMwUqMzpQPzftabQuduQ";

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
  await page.goto("/app/instruments");
  await registerRequest;
  expect(browserErrors).toEqual([]);
  await expect(page.getByRole("heading", { level: 1, name: "Instruments" })).toBeVisible();
  const row = page.getByRole("row", { name: /XSTK/ });
  await expect(row).toContainText("Certificate");
  // No logo was captured for this mint, so its mark is lettered, not an image.
  await expect(row.getByTestId("lot-mark")).toHaveText("XS");
  await expect(row.locator("img[data-testid='lot-mark']")).toHaveCount(0);
  await row.getByRole("link", { name: "Open assay" }).click();

  await expect(page).toHaveURL(`/app/instruments/${mint}`);
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
  await page.goto("/app/instruments");

  await expect(page.getByRole("heading", { level: 1, name: "Instruments" })).toBeVisible();
  await expect(page.getByText("Terminal API unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Set SEAMETRY_API_URL to a deployed or local Gateway.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inspect live Alloys" })).toHaveAttribute("href", "/app/alloys");
  await expect(page.getByRole("link", { name: "Return to the desk" })).toHaveAttribute("href", "/app");
});

test("the Terminal distinguishes an empty persisted register from an unavailable Gateway", async ({ page }) => {
  await page.goto("/app/instruments");
  await expect(page.getByText("No persisted instruments", { exact: true })).toBeVisible();
  await expect(page.getByText("The Gateway answered with an empty instrument register as of Sep 29, 2026, 12:00 PM UTC.", { exact: true })).toBeVisible();
  await expect(page.getByText("Terminal API unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Inspect live Alloys" })).toHaveAttribute("href", "/app/alloys");
});

test("the Terminal moves from the live Hall register into one Alloy record", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/app/alloys");
  await expect(page.getByRole("heading", { level: 1, name: "Alloys" })).toBeVisible();
  const row = page.getByRole("listitem", { name: "Alloy 1790627156984" });
  await expect(row).toContainText("1 held as a Claim");
  // 1,000,000 share atoms at the share mint's 6 decimals is one share, as a wallet shows it.
  await expect(row).toContainText("1.000000 shares");
  await row.getByRole("link", { name: "Open Alloy" }).click();

  await expect(page).toHaveURL(`/app/alloys/${alloyAddress}`);
  // No metadata on the share mint and no founding record: titled by its id.
  await expect(page.getByRole("heading", { level: 1, name: "Alloy 1790627156984" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "One share holds" })).toBeVisible();
  // One mark per leg in what a share holds, lettered: the fixture's legs have no record.
  await expect(page.getByRole("region", { name: "One share holds" }).getByTestId("lot-mark")).toHaveCount(2);
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("The issuer currently prevents this Hall account from delivering.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Per share" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Alloys" })).toHaveAttribute("href", "/app/alloys");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("a founded Alloy is named, pictured and listed by stock from its founding record", async ({ page }) => {
  // What the Gateway returns before it reads mint metadata: addresses and
  // amounts only. The founding record must supply the rest.
  const record = JSON.parse(readFileSync("../../shared/evidence/alloys/stoic-crew/founding.json", "utf8"));
  const logos = JSON.parse(readFileSync("../../shared/evidence/instrument-logos.json", "utf8")).logos;
  const amount = (atoms: string) => ({ atoms, scale: 8 });
  const alloy = {
    address: record.alloy, sponsor: record.sponsor, share_mint: record.share_mint, id: record.id,
    supply: record.supply_atoms, locked_genesis: record.locked_genesis_atoms, cluster: "devnet",
    legs: record.legs.map((leg: { stand_in: string; atoms_per_share: string }) => ({
      mint: leg.stand_in, ledger: amount(leg.atoms_per_share), pending: amount("0"), unclaimed: amount("0"), held_back: false,
    })),
  };
  const terms = { shares: "1000000", legs: alloy.legs.map((leg: { mint: string; ledger: object }) => ({ stock: leg.mint, amount: leg.ledger, kept: amount("0") })) };
  const meta = { served_at: servedAt, as_of: servedAt, completeness: "complete", cluster: "devnet" };
  await page.route(`**/api/terminal/alloys/${record.alloy}`, (route) =>
    route.fulfill({ json: { alloy: { data: alloy, meta }, strike: { data: terms, meta }, melt: { data: terms, meta } } }),
  );

  await page.goto(`/app/alloys/${record.alloy}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: record.name })).toBeVisible();
  await expect(main.getByText(record.symbol, { exact: true })).toBeVisible();
  await expect(main.getByRole("img", { name: `${record.name} artwork` })).toHaveAttribute("src", new URL(record.image).pathname);
  const holdings = main.getByRole("region", { name: "One share holds" }).getByRole("listitem");
  await expect(holdings).toHaveCount(record.legs.length);
  for (const [index, leg] of record.legs.entries()) {
    const row = holdings.nth(index);
    await expect(row).toContainText(leg.symbol);
    const logo = logos.find((entry: { mint: string }) => entry.mint === leg.real_mint);
    await expect(row.getByTestId("lot-mark")).toHaveAttribute("src", logo.path);
  }
});

test("Strike and Melt are held, with their reasons, until a wallet logs in", async ({ page }) => {
  await page.goto(`/app/alloys/${alloyAddress}`);
  const actions = page.getByRole("main").getByRole("region", { name: "Strike or Melt" });
  await expect(actions.getByRole("button", { name: "Strike shares" })).toBeDisabled();
  await expect(actions.getByRole("button", { name: "Melt shares" })).toBeDisabled();
  await expect(actions.getByText("Log in with a devnet wallet: it signs the Strike or Melt.").first()).toBeVisible();
});

test("a Strike opens its steps and stops at the first with what did not happen", async ({ page }) => {
  // The page reads the wallet's shares and Claim from devnet; answering with
  // an RPC error keeps the test off the public network, and reads as none.
  await page.route("https://api.devnet.solana.com/**", (route) => route.fulfill({ json: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "fixture" } } }));
  await registerTestWallet(page, { trusted: true });
  await page.goto(`/app/alloys/${alloyAddress}`);
  await page.getByText("Log in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  const actions = page.getByRole("main").getByRole("region", { name: "Strike or Melt" });
  // The fixture's share mint is not a real address: the panel says so
  // rather than waiting on a read that cannot be made.
  await expect(actions.getByText("is not a Solana address, so your shares cannot be read.", { exact: false }).first()).toBeVisible();
  await expect(actions.getByRole("button", { name: "Melt shares" })).toBeDisabled();

  await actions.getByRole("button", { name: "Strike shares" }).click();
  // The test server has no funder key, so preparation stops at step one.
  const dialog = page.getByRole("dialog", { name: "Strike 1.000000 shares" });
  await expect(dialog).toBeVisible();
  const steps = dialog.getByTestId("step-register").getByRole("listitem");
  await expect(steps.nth(0)).toContainText("Stopped");
  await expect(steps.nth(1)).toContainText("Waiting");
  await expect(steps.nth(0).getByRole("alert")).toContainText("HALL_DEMO_FUNDER_SECRET_KEY is not set");
});

test("the Strike route refuses what it cannot prepare before it spends anything", async ({ request }) => {
  const bad = await request.post("/api/alloys/strike", { data: { alloy: alloyAddress, striker: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d", shares: "1.5" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('shares must be a whole number of share atoms above zero, as a string, received "1.5".');
  const notKey = await request.post("/api/alloys/strike", { data: { alloy: "nope", striker: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d", shares: "1000000" } });
  expect((await notKey.json()).error).toBe('alloy must be a Solana public key, received "nope".');
});
