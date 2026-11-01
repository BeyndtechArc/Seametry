import { expect, test, type Page } from "@playwright/test";
import { theme } from "@seametry/ui/tokens";

// Colour mode (@seametry/ui/theme-control): light, dark or the system's,
// stored, and applied before first paint by the boot script in
// src/app/layout.tsx. Public pages open light and the product opens dark
// until a choice is stored (Storm, 30 September 2026).
const storageKey = "seametry-theme-v1";

// Records the theme the document carried the moment its markup finished
// parsing, before any React effect could run.
async function recordFirstPaint(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { firstTheme?: string }).firstTheme = document.documentElement.dataset.theme;
    }, { once: true });
  });
}

// Every theme-color meta the document carries, deduplicated by value.
const themeColors = (page: Page) => page.evaluate(() => [...new Set([...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute("content")))]);

const firstTheme = (page: Page) => page.evaluate(() => (window as unknown as { firstTheme?: string }).firstTheme);

test("a stored dark choice is already applied when the markup is parsed, on a public page", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((key) => localStorage.setItem(key, "dark"), storageKey);
  await recordFirstPaint(page);
  await page.goto("/");
  expect(await firstTheme(page)).toBe("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors.filter((text) => /hydrat|did not match|418/i.test(text))).toEqual([]);
});

test("a stored light choice holds on the product, which otherwise opens dark", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "light"), storageKey);
  await recordFirstPaint(page);
  await page.goto("/app");
  expect(await firstTheme(page)).toBe("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("System follows the operating system, live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const choice = page.getByRole("radiogroup", { name: "Theme" });
  await choice.getByRole("radio", { name: "System" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "System" })).toBeChecked();
});

test("the choice is offered as light, dark and system, persists across pages, and sets the browser's theme colour", async ({ page }) => {
  await page.goto("/");
  const choice = page.getByRole("radiogroup", { name: "Theme" });
  await expect(choice.getByRole("radio")).toHaveCount(3);
  await choice.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe("dark");
  await expect.poll(() => themeColors(page)).toEqual([theme.dark.surface.ground]);
  await page.goto("/app/allocation");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const appChoice = page.getByRole("radiogroup", { name: "Theme" });
  await expect(appChoice.getByRole("radio", { name: "Dark" })).toBeChecked();
  await appChoice.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => themeColors(page)).toEqual([theme.light.surface.ground]);
});

test("the dark ground is the olive-black touchstone, and text selection is themed", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "dark"), storageKey);
  await page.goto("/");
  const resolve = (css: string) => page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = value;
    document.body.append(probe);
    const rendered = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return rendered;
  }, css);
  const ground = await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(ground).toBe(await resolve(theme.dark.surface.ground));
  const selection = await page.evaluate(() => getComputedStyle(document.body, "::selection").backgroundColor);
  expect(selection).not.toBe(await resolve("transparent"));
});

const pages = ["/", "/app", "/app/allocation", "/app/baskets/build", "/app/positions", "/app/alloys", "/sign-in", "/docs"];
for (const mode of ["light", "dark"] as const) {
  test(`key pages render in ${mode}`, async ({ page }) => {
    test.skip(!process.env.SEAMETRY_THEME_SHOTS, "screenshots on request");
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [storageKey, mode]);
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${process.env.SEAMETRY_THEME_SHOTS}/${mode}${path === "/" ? "-home" : path.replaceAll("/", "-")}.png` });
    }
  });
}
