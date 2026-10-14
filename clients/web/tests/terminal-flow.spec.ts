import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { admissions, isAdmitted } from "../src/lib/allocation/admissions";
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

test("the instrument register is one list that opens one assay", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const aapl = admissions.instruments.find((entry) => entry.instrument.symbol === "AAPLx")!;
  await page.route(`**/api/terminal/instruments/${aapl.instrument.mint}`, async (route) => {
    await route.fulfill({
      json: {
        instrument: { data: { ...instrument, mint: aapl.instrument.mint, symbol: "AAPLx" }, meta },
        admissibility: {
          data: {
            decision: "BLOCK",
            // The policy cites each issuer power in the power's own words, as the live engine does.
            reasons: [{ code: "UNKNOWN_EXTENSION", severity: "BLOCK", fact: "Extension 91 is not decoded." }, { code: "ISSUER_CAN_FREEZE", severity: "WARN", fact: "The issuer can freeze an account holding this instrument." }],
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

  await page.goto("/app/instruments");
  await expect(page.getByRole("heading", { level: 1, name: "Instruments" })).toBeVisible();
  // One title: no second header restates the page.
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /^Available/ })).toHaveAttribute("aria-selected", "true");
  const register = page.getByRole("list", { name: "Instruments" });
  await page.getByRole("searchbox").fill("AAPLx");
  const row = register.getByRole("listitem").filter({ hasText: "AAPLx" });
  await expect(row).toContainText("Apple");
  await expect(row).toContainText("xStocks");
  await expect(row).toContainText("Certificate");
  // The mirrored logo is drawn at the identity size, and nothing says "Open".
  await expect(row.locator("img[data-testid='lot-mark']")).toHaveAttribute("width", "40");
  await expect(row.getByText(/open/i)).toHaveCount(0);
  await row.getByRole("link").click();

  await expect(page).toHaveURL(`/app/instruments/${aapl.instrument.mint}`);
  await expect(page.getByRole("heading", { level: 1, name: "AAPLx" })).toBeVisible();
  await expect(page.getByText("Apple", { exact: true })).toBeVisible();
  // The decision is stated once, by its stamp.
  await expect(page.getByText("Block", { exact: true })).toHaveCount(1);
  await expect(page.getByText("BLOCK", { exact: true })).toHaveCount(0);
  await expect(page.getByText("policy-2026.09.2", { exact: true })).toBeVisible();
  await expect(page.getByText("Extension 91 is not decoded.", { exact: true })).toBeVisible();
  // Each issuer power appears once, under Issuer powers, with the code the policy filed it under.
  await expect(page.getByText("The issuer can freeze an account holding this instrument.", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("listitem").filter({ hasText: "The issuer can freeze an account" })).toContainText("ISSUER_CAN_FREEZE");
  const depth = page.getByRole("list", { name: "Shortfall by buy size" }).getByRole("listitem");
  await expect(depth.filter({ hasText: "10 USDC" })).toContainText("35 bps");
  await expect(depth.filter({ hasText: "25 USDC" })).toContainText("No route");
  await expect(page.getByRole("figure")).toContainText("Jupiter quotes, 17s old");
  await expect(page.getByRole("note").filter({ hasText: "Sell depth" })).toContainText("SELL_DEPTH_NOT_MEASURED");
  expect(browserErrors).toEqual([]);
});

test("the instrument catalogue names every listing from its mint and calls none assayed that is not", async ({ request }) => {
  const listings = ["backpack-securities", "xstocks"].map((name) => JSON.parse(readFileSync(`../../shared/evidence/listings/${name}.json`, "utf8")) as { tokens: unknown[] });
  const response = await request.get("/api/instruments/catalogue?q=Agilent&state=any");
  expect(response.ok()).toBe(true);
  const catalogue = await response.json();
  expect(catalogue.meta.total).toBe(listings.reduce((sum, listing) => sum + listing.tokens.length, 0));
  const agilent = (catalogue.data as { symbol: string; name?: string; state: string }[]).find((entry) => entry.symbol === "A");
  expect(agilent).toMatchObject({ name: "Agilent Technologies", state: "listed" });
  const everything = await (await request.get("/api/instruments/catalogue?state=bogus")).json();
  expect(everything.detail).toContain("Expected ?state= one of any, available, assayed, listed");
});

test("every assay tab fits a phone without hiding one off the edge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/instruments");
  const tabs = page.getByRole("tablist", { name: "Assay state" });
  await expect(tabs.getByRole("tab")).toHaveCount(4);
  const [scroll, client] = await tabs.evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scroll).toBeLessThanOrEqual(client);
});

test("the tabs count each assay state and drop a column that would repeat on every row", async ({ page }) => {
  await page.goto("/app/instruments");
  const available = page.getByRole("tab", { name: /^Available/ });
  await expect(available).toContainText(String(admissions.instruments.filter(isAdmitted).length));
  const register = page.getByRole("list", { name: "Instruments" });
  await page.getByRole("tab", { name: /^Not assayed/ }).click();
  await expect(register.getByRole("listitem").first()).not.toContainText("Not assayed");
  await page.getByRole("tab", { name: /^All/ }).click();
  await expect(register.getByRole("listitem").filter({ hasText: "Not assayed" }).first()).toBeVisible();
});

test("an assay the Gateway cannot serve names the boundary instead of an empty page", async ({ page }) => {
  await page.route(`**/api/terminal/instruments/${mint}`, async (route) => {
    await route.fulfill({ status: 503, json: { title: "Terminal API unavailable", detail: "Set SEAMETRY_API_URL to a deployed or local Gateway.", status: 503 } });
  });
  await page.goto(`/app/instruments/${mint}`);
  await expect(page.getByText("Terminal API unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Set SEAMETRY_API_URL to a deployed or local Gateway.", { exact: true })).toBeVisible();
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
    // The page asks the logo route by the real mint, and the route answers with the mirrored file.
    await expect(row.getByTestId("lot-mark")).toHaveAttribute("src", `/instruments/logo/${leg.real_mint}`);
    const answer = await page.request.get(`/instruments/logo/${leg.real_mint}`, { maxRedirects: 0 });
    expect(answer.status()).toBe(307);
    expect(new URL(answer.headers().location, "http://localhost").pathname).toBe(logo.path);
  }
});

test("Strike and Melt are held, with their reasons, until a wallet logs in", async ({ page }) => {
  await page.goto(`/app/alloys/${alloyAddress}`);
  await page.getByRole("button", { name: "Strike or Melt" }).click();
  const actions = page.getByRole("dialog", { name: "Strike or Melt" });
  await expect(actions.getByRole("list", { name: "Alloy action steps" })).toContainText("Choose action");
  await expect(actions.getByRole("radio", { name: "Strike" })).toBeChecked();
  await actions.getByRole("button", { name: "Set Strike amount" }).click();
  await expect(actions.getByRole("button", { name: "Strike shares" })).toBeDisabled();
  // The fixture's second leg is held back, which refuses Strike whoever logs in, so that reason leads.
  await expect(actions.getByText("is held back by its issuer, so the Hall cannot take it in. Melt still works.", { exact: false }).first()).toBeVisible();
  await expect(actions.getByRole("list", { name: "Strike quantities" })).toContainText("5.000000");
  await actions.getByRole("textbox", { name: "Shares to Strike" }).fill("2");
  await expect(actions.getByRole("list", { name: "Strike quantities" })).toContainText("10.000000");
  await expect(actions.getByRole("list", { name: "Strike quantities" })).toContainText("6.000000");
  await expect(actions.getByText("Solana devnet via Gateway", { exact: false }).last()).toBeVisible();
  await actions.getByRole("list", { name: "Alloy action steps" }).getByRole("button").click();
  await actions.getByRole("radio", { name: "Melt" }).click();
  await actions.getByRole("button", { name: "Set Melt amount" }).click();
  await expect(actions.getByRole("button", { name: "Melt shares" })).toBeDisabled();
  await expect(actions.getByText("Log in with a devnet wallet: it signs the Strike or Melt.").first()).toBeVisible();
});

test("a held-back leg refuses Strike before any signature, and leaves Melt open", async ({ page }) => {
  const record = JSON.parse(readFileSync("../../shared/evidence/alloys/stoic-crew/founding.json", "utf8"));
  const amount = (atoms: string) => ({ atoms, scale: 8 });
  const alloy = {
    address: record.alloy, sponsor: record.sponsor, share_mint: record.share_mint, id: record.id,
    supply: record.supply_atoms, locked_genesis: record.locked_genesis_atoms, cluster: "devnet",
    legs: record.legs.map((leg: { stand_in: string; atoms_per_share: string }, index: number) => ({
      mint: leg.stand_in, ledger: amount(leg.atoms_per_share), pending: amount("0"), unclaimed: amount("0"), held_back: index === 1,
    })),
  };
  const terms = { shares: "1000000", legs: alloy.legs.map((leg: { mint: string; ledger: object }) => ({ stock: leg.mint, amount: leg.ledger, kept: amount("0") })) };
  const meta = { served_at: servedAt, as_of: servedAt, completeness: "complete", cluster: "devnet" };
  await page.route(`**/api/terminal/alloys/${record.alloy}`, (route) =>
    route.fulfill({ json: { alloy: { data: alloy, meta }, strike: { data: terms, meta }, melt: { data: terms, meta } } }),
  );
  await page.route(`**/api/terminal/alloys/${record.alloy}/terms?**`, (route) => route.fulfill({ json: { data: terms, meta } }));
  let strikeRequests = 0;
  await page.route("**/api/alloys/strike", (route) => { strikeRequests += 1; return route.fulfill({ status: 500, json: { error: "must not be called" } }); });

  await page.goto(`/app/alloys/${record.alloy}`);
  await page.getByRole("button", { name: "Strike or Melt" }).click();
  const actions = page.getByRole("dialog", { name: "Strike or Melt" });
  await actions.getByRole("button", { name: "Set Strike amount" }).click();
  await expect(actions.getByRole("button", { name: "Strike shares" })).toBeDisabled();
  await expect(actions.getByText(`Strike refused: ${record.legs[1].symbol} is held back by its issuer, so the Hall cannot take it in. Melt still works.`).first()).toBeVisible();
  // The blocked Key still answers a press: it explains, and offers the way out.
  await actions.getByRole("button", { name: "Strike shares" }).click({ force: true });
  const why = page.getByRole("dialog", { name: "Strike refused while a leg is held back" });
  await expect(why).toBeVisible();
  await expect(why).toContainText(`${record.legs[1].symbol} is held back by its issuer`);
  await why.getByRole("button", { name: "Melt instead" }).click();
  await expect(why).toHaveCount(0);
  expect(strikeRequests).toBe(0);
  await expect(actions.getByRole("list", { name: "Melt quantities" })).toContainText("held as Claim");
});

test("Alloy terms reject an invalid share amount before reaching the Gateway", async ({ request }) => {
  const response = await request.get(`/api/terminal/alloys/${alloyAddress}/terms?side=strike&shares=1.5`);
  expect(response.status()).toBe(400);
  expect((await response.json()).detail).toContain("integer share atoms");
});

test("a Strike opens its steps and stops at the first with what did not happen", async ({ page }) => {
  // The page reads the wallet's shares and Claim from devnet; answering with
  // an RPC error keeps the test off the public network, and reads as none.
  await page.route("https://api.devnet.solana.com/**", (route) => route.fulfill({ json: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "fixture" } } }));
  // The fixture holds one leg back, which refuses Strike before any step;
  // this test is about the steps, so the page sees every leg released.
  await page.route(`**/api/terminal/alloys/${alloyAddress}`, async (route) => {
    const body = await (await route.fetch()).json();
    body.alloy.data.legs = body.alloy.data.legs.map((leg: object) => ({ ...leg, held_back: false }));
    await route.fulfill({ json: body });
  });
  await registerTestWallet(page, { trusted: true });
  await page.goto(`/app/alloys/${alloyAddress}`);
  await page.getByText("Connect", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Strike or Melt" }).click();
  const actions = page.getByRole("dialog", { name: "Strike or Melt" });
  // The fixture's share mint is not a real address: the panel says so
  // rather than waiting on a read that cannot be made.
  await actions.getByRole("radio", { name: "Melt" }).click();
  await actions.getByRole("button", { name: "Set Melt amount" }).click();
  await expect(actions.getByText("is not a Solana address, so your shares cannot be read.", { exact: false }).first()).toBeVisible();
  await expect(actions.getByRole("button", { name: "Melt shares" })).toBeDisabled();
  await actions.getByRole("list", { name: "Alloy action steps" }).getByRole("button").click();
  await actions.getByRole("radio", { name: "Strike" }).click();
  await actions.getByRole("button", { name: "Set Strike amount" }).click();

  await actions.getByRole("button", { name: "Strike shares" }).click();
  // The test server has no funder key, so preparation stops at step one.
  const dialog = page.getByRole("dialog", { name: "Action stopped" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("Action stopped");
  await expect(dialog.getByRole("alert")).toContainText("HALL_DEMO_FUNDER_SECRET_KEY is not set");
  // A finished action does not trap the Key: it opens the sheet again, so Melt is reachable.
  await dialog.getByRole("button", { name: "Close Alloy outcome" }).click();
  await page.getByRole("button", { name: "Strike or Melt" }).click();
  await expect(page.getByRole("dialog", { name: "Strike or Melt" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Action stopped" })).toHaveCount(0);
  await page.getByRole("dialog", { name: "Strike or Melt" }).getByRole("radio", { name: "Melt" }).click();
  await expect(page.getByRole("dialog", { name: "Strike or Melt" }).getByRole("button", { name: "Set Melt amount" })).toBeVisible();
});

test("the Strike route refuses what it cannot prepare before it spends anything", async ({ request }) => {
  const bad = await request.post("/api/alloys/strike", { data: { alloy: alloyAddress, striker: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d", shares: "1.5" } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('shares must be a whole number of share atoms above zero, as a string, received "1.5".');
  const notKey = await request.post("/api/alloys/strike", { data: { alloy: "nope", striker: "4vJ9JU1bJJE96FWSJKvHsmmFZjwQXW8UTQpLzMAnX1d", shares: "1000000" } });
  expect((await notKey.json()).error).toBe('alloy must be a Solana public key, received "nope".');
});
