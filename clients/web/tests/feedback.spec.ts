import { expect, test, type APIRequestContext } from "@playwright/test";

type Report = { kind: string; secret: string | null; body: Record<string, unknown> };

async function feedbackReports(request: APIRequestContext): Promise<Report[]> {
  const all: Report[] = await (await request.get("http://127.0.0.1:3846/fixture/activity")).json();
  return all.filter((report) => report.kind === "feedback");
}

test("the footer reaches the team through Send feedback alone, and the X account is an icon with its name", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
  await expect(footer.getByRole("link", { name: /@/ })).toHaveCount(0);
  const x = footer.getByRole("list", { name: "Seametry elsewhere" }).getByRole("link", { name: "Seametry on X" });
  await expect(x).toHaveAttribute("href", "https://x.com/seametry_");
  await expect(x).toHaveText("");
});

test("feedback needs no account and reaches the team through the server, with a reply address if given", async ({ page, request }) => {
  await page.goto("/feedback");
  const send = page.getByRole("button", { name: "Send feedback" });
  await expect(send).toBeDisabled();
  const message = `Sell All stalled on review. ${crypto.randomUUID()}`;
  await page.getByLabel("What happened, or what should change").fill(message);
  await page.getByLabel("Your email, for a reply").fill("holder@example.com");
  await send.click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Sent to the team");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("A reply comes to holder@example.com.");

  await expect.poll(async () => (await feedbackReports(request)).filter((report) => report.body.message === message)).toHaveLength(1);
  const [report] = (await feedbackReports(request)).filter((entry) => entry.body.message === message);
  expect(report.secret).toBe("fixture-activity-secret");
  expect(report.body).toMatchObject({ message, reply_to: "holder@example.com", deployment: "development" });
  expect(report.body.wallet).toBeUndefined();
});

test("feedback that cannot be kept says so and names the address that still reaches the team", async ({ page }) => {
  await page.goto("/feedback");
  await page.getByLabel("What happened, or what should change").fill("fixture: the gateway fails");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Email seametry@beyndtech.com instead.");
  // The message stays, so nothing written is lost.
  await expect(page.getByLabel("What happened, or what should change")).toHaveValue("fixture: the gateway fails");
});

test("an incomplete reply address is refused in words, before anything is sent", async ({ request }) => {
  const response = await request.post("/api/feedback", { data: { message: "hello", replyTo: "holder@" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("email address is incomplete");
  expect((await request.post("/api/feedback", { data: { message: "   " } })).status()).toBe(400);
  expect((await request.post("/api/feedback", { data: { message: "a".repeat(4001) } })).status()).toBe(400);
});

test("the app's status bar carries the way to send feedback", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/instruments");
  await expect(page.getByRole("navigation", { name: "Reading" }).getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback");
});
