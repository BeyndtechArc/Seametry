import { expect, test } from "@playwright/test";

test("the Alloy surface exposes the recorded formula and missing market evidence", async ({ page }) => {
  await page.goto("/app/alloys/storm");
  // The app's loading boundary streams the page into a hidden holder before
  // moving it into <main>; scoping to <main> reads the page itself, and a CI
  // run caught both copies at once before this was scoped.
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { level: 1, name: "STORM" })).toBeVisible();
  await expect(main.getByText("Labelled devnet fixture", { exact: true })).toBeVisible();
  await expect(main.getByText("Devnet Hall. Key still in hand.", { exact: true })).toBeVisible();

  for (const section of ["Valuation", "Formula", "Condition", "Provenance"]) {
    await expect(main.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }

  const formula = main.getByTestId("formula-ledger");
  await expect(formula.getByRole("row")).toHaveCount(3);
  await expect(formula.getByRole("row", { name: /Mock stock A/ })).toBeVisible();
  await expect(formula.getByRole("row", { name: /Mock stock B/ })).toBeVisible();

  const valuation = main.getByTestId("valuation");
  for (const label of ["NAV per share", "Share price"]) {
    const figure = valuation.getByRole("figure").filter({ hasText: label });
    await expect(figure.getByText("No observation", { exact: true }).first()).toBeVisible();
  }
  await expect(main.getByRole("button", { name: "Prepare strike" })).toBeDisabled();
  await expect(main.getByText("Execution is not connected to this fixture.", { exact: true })).toBeVisible();
});

test("the Alloy surface carries the page-wide colour mode control", async ({ page }) => {
  await page.goto("/app/alloys/storm");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Use dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Use light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
