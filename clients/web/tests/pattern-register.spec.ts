import { expect, test } from "@playwright/test";
import { theme } from "@seametry/ui/tokens";

test("the Pattern Register exposes identity, states, and stress specimens", async ({ page }) => {
  await page.goto("/patterns");

  await expect(page.getByRole("heading", { level: 1, name: "The Pattern Register" })).toBeVisible();
  await expect(page.getByText("Labelled fixture data", { exact: true })).toBeVisible();

  for (const section of ["Atoms", "Compositions", "State assay", "Stress bench"]) {
    await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
  }

  await expect(page.getByTestId("hallmark-row").getByTestId("punch")).toHaveCount(4);

  for (const composition of ["Formula ledger", "Condition report", "Provenance line"]) {
    await expect(page.getByRole("heading", { level: 3, name: composition })).toBeVisible();
  }

  const stateAssay = page.getByTestId("state-assay");
  for (const state of ["Default", "Loading", "Empty", "Stale", "Unavailable", "Error"]) {
    await expect(stateAssay.getByRole("heading", { level: 3, name: state, exact: true })).toBeVisible();
  }

  await expect(page.getByTestId("dark-specimen")).toBeVisible();
  await expect(page.getByTestId("light-specimen")).toBeVisible();

  const darkGround = await page.getByTestId("dark-specimen").evaluate((node) => getComputedStyle(node).backgroundColor);
  const lightGround = await page.getByTestId("light-specimen").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(darkGround).not.toBe(lightGround);
});

test("the Pattern Register lets the reader compare muted light and dark modes", async ({ page }) => {
  await page.goto("/patterns");

  const modeControl = page.getByRole("button", { name: "Use dark mode" });
  await expect(page.getByRole("button", { name: /Use (?:light|dark) mode/ })).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const lightGround = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  const tokenGround = await page.evaluate((ground) => {
    const probe = document.createElement("div");
    probe.style.color = ground;
    document.body.append(probe);
    const renderedGround = getComputedStyle(probe).color;
    probe.remove();
    return renderedGround;
  }, theme.light.surface.ground);
  expect(lightGround).toBe(tokenGround);

  await modeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Use light mode" })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Use light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Use dark mode" })).toBeVisible();
});

test("the Pattern Register states the edge grammar and reserves one Key", async ({ page }) => {
  await page.goto("/patterns");

  const edgeGrammar = page.getByTestId("edge-grammar");
  for (const edge of ["Evidence edge", "Registration cut", "Control edge"]) {
    await expect(edgeGrammar.getByRole("heading", { level: 3, name: edge })).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Approve and sign" })).toHaveCount(1);
  await expect(page.getByText("Reserved for the action that changes custody or state.", { exact: true })).toBeVisible();
});

test("the Pattern Register maps action emphasis to purpose", async ({ page }) => {
  await page.goto("/patterns");

  const register = page.getByTestId("action-register");
  for (const action of ["Route action", "Quiet link", "Text action", "The Key"]) {
    await expect(register.getByRole("heading", { level: 3, name: action })).toBeVisible();
  }

  await expect(register.getByRole("link", { name: "Inspect live Alloys" })).toBeVisible();
  await expect(register.getByRole("link", { name: "Compare evidence" })).toBeVisible();
  await expect(register.getByRole("link", { name: "Read contract" })).toBeVisible();
  await expect(register.getByRole("button", { name: "Approve and sign" })).toHaveCount(1);
});
