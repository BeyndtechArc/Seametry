import { expect, test } from "@playwright/test";

for (const device of [
  { name: "iPhone Safari", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { name: "Android Chrome", userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" },
]) test(`${device.name} carries its unsigned Allocation into Phantom`, async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: device.userAgent,
  });
  const page = await context.newPage();
  await page.goto("/app/allocation");
  await page.getByRole("checkbox", { name: /Add .* to the basket/ }).first().check();
  await page.getByRole("button", { name: "Set amount" }).click();
  await page.getByLabel("USDC to spend").fill("25");
  await page.getByRole("button", { name: "Connect wallet" }).last().click();
  const handoff = page.getByRole("link", { name: "Open Allocation in Phantom" });
  await expect(handoff).toBeVisible();
  const solflare = page.getByRole("link", { name: "Open Allocation in Solflare" });
  await expect(solflare).toBeVisible();
  await expect(handoff.locator("svg")).toHaveCount(1);
  await expect(solflare.locator("svg")).toHaveCount(1);
  const solflareHref = await solflare.getAttribute("href");
  expect(solflareHref).toContain("https://solflare.com/ul/v1/browse/");
  expect(new URL(solflareHref!).searchParams.get("ref")).toBe(page.url().split("/app/")[0]);
  const href = await handoff.getAttribute("href");
  expect(href).toContain("https://phantom.com/ul/browse/");
  const destination = decodeURIComponent(new URL(href!).pathname.slice("/ul/browse/".length));
  const planUrl = new URL(destination);
  expect(planUrl.pathname).toBe("/app/allocation");
  expect(planUrl.searchParams.get("amount")).toBe("25");
  expect(planUrl.searchParams.get("selected")).toBeTruthy();
  await page.goto(`${planUrl.pathname}${planUrl.search}`);
  await expect(page.getByLabel("USDC to spend")).toHaveValue("25");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("checkbox", { name: /Add .* to the basket/ }).first()).toBeChecked();
  await context.close();
});

test("Sponsor identifies its signing network and leaves breathing room under mobile tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/compose");
  await expect(page).toHaveTitle("Sponsor | Seametry");
  await expect(page.getByRole("main").getByRole("heading", { name: "Sponsor" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Devnet", { exact: true })).toBeVisible();
  const padding = await page.getByRole("navigation", { name: "Mobile product" }).evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom));
  expect(padding).toBeGreaterThan(12);
});
