import { logRefusal } from "../src/lib/refusal-log";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { CONSENT_TEXT, CONSENT_VERSION } from "../src/lib/email-optin";

type Report = { kind: string; secret: string | null; body: Record<string, unknown> };

async function optIns(request: APIRequestContext, address: string): Promise<Report[]> {
  const reports: Report[] = await (await request.get("http://127.0.0.1:3846/fixture/activity")).json();
  return reports.filter((report) => report.kind.startsWith("email-optins") && JSON.stringify(report.body).includes(address));
}

const forwarded = { "x-forwarded-for": "" };

test("an address is kept only with the box ticked, with the consent version, page and ref code, through the server's secret", async ({ page, request }) => {
  const address = `holder-${Date.now()}@example.com`;
  await page.goto("/r/x?to=/feedback");
  await expect(page).toHaveURL(/\/feedback\?ref=x$/);
  const field = page.getByRole("region", { name: "Tell me when the Hall launches and when my trades settle" });
  await field.getByLabel("Email address").fill(address);
  await expect(field.getByRole("button", { name: "Keep my address" })).toBeDisabled();
  await field.getByText(CONSENT_TEXT).click();
  await field.getByRole("button", { name: "Keep my address" }).click();
  const kept = page.getByRole("alert").filter({ hasText: "Address kept" });
  await expect(kept).toBeVisible();
  const link = kept.getByRole("link", { name: "this unsubscribe link" });
  await expect(link).toHaveAttribute("href", /\/unsubscribe\?token=fixture-token-\d+$/);

  const [report] = await optIns(request, address);
  expect(report.secret).toBe("fixture-activity-secret");
  expect(report.body).toEqual({ address, consent_version: CONSENT_VERSION, deployment: "development", page: "feedback", ref_code: "x" });
});

test("an opt-in without consent, with stale wording, or with a broken address is refused and nothing is forwarded", async ({ request }) => {
  const address = `refused-${Date.now()}@example.com`;
  const headers = { ...forwarded, "x-forwarded-for": `198.51.100.${Date.now() % 200}` };
  expect((await request.post("/api/email-optin", { headers, data: { address, consentVersion: CONSENT_VERSION } })).status()).toBe(400);
  expect((await request.post("/api/email-optin", { headers, data: { address, consent: true, consentVersion: "2020-01-01" } })).status()).toBe(409);
  expect((await request.post("/api/email-optin", { headers, data: { address: "holder@", consent: true, consentVersion: CONSENT_VERSION } })).status()).toBe(400);
  expect(await optIns(request, address)).toHaveLength(0);
});

test("one network address may give five addresses in ten minutes", async ({ request }) => {
  const headers = { "x-forwarded-for": "203.0.113.77" };
  const statuses: number[] = [];
  for (let index = 0; index < 6; index++) {
    statuses.push((await request.post("/api/email-optin", { headers, data: { address: `limit-${index}-${Date.now()}@example.com`, consent: true, consentVersion: CONSENT_VERSION } })).status());
  }
  expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
});

test("the unsubscribe link withdraws with one button, and a used link says so", async ({ page, request }) => {
  await page.goto("/unsubscribe?token=fixture-live-token");
  await page.getByRole("button", { name: "Unsubscribe and erase my address" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The address is erased." })).toBeVisible();
  const [report] = await optIns(request, "fixture-live-token");
  expect(report).toMatchObject({ kind: "email-optins/unsubscribe", secret: "fixture-activity-secret", body: { token: "fixture-live-token" } });

  await page.goto("/unsubscribe?token=fixture-used-token");
  await page.getByRole("button", { name: "Unsubscribe and erase my address" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This link is not recognised." })).toBeVisible();

  await page.goto("/unsubscribe");
  await expect(page.getByText("This link carries no token")).toBeVisible();
});

test("the privacy policy says what the outreach list keeps and how to leave it", async ({ page }) => {
  await page.goto("/privacy-policy");
  await expect(page.getByText(/public hackathon project pages and public profiles/)).toBeVisible();
  await expect(page.getByText(/It holds no email address/)).toBeVisible();
  await expect(page.getByText(/ask for your entry to be corrected or removed/)).toBeVisible();
});

test("the privacy policy says what an opt-in keeps, why, and how to stop it", async ({ page }) => {
  await page.goto("/privacy-policy");
  await expect(page.getByText("Effective 31 October 2026")).toBeVisible();
  await expect(page.getByText(/erases the address, the wallet and the link itself/)).toBeVisible();
  await expect(page.getByText(/Today no email is sent to these addresses at all/)).toBeVisible();
  await expect(page.getByText(/infrastructure connection/)).toHaveCount(0);
});

test("an address the Gateway refuses is in neither the answer nor the log line, which carries a reference instead", async ({ request }) => {
  const address = `gateway-refuses-${Date.now()}@example.com`;
  const headers = { "x-forwarded-for": `203.0.113.${Date.now() % 200}` };
  const response = await request.post("/api/email-optin", { headers, data: { address, consent: true, consentVersion: CONSENT_VERSION } });
  expect(response.status()).toBe(400);
  const text = await response.text();
  expect(text).not.toContain(address);
  expect(text).not.toContain("gateway-refuses");
  expect(JSON.parse(text).reference).toMatch(/^[0-9a-f-]{36}$/);
});

test("a refusal's log line names the reason and a reference, and no address the Gateway repeated", async () => {
  const lines: string[] = [];
  const warn = console.warn;
  console.warn = (...parts: unknown[]) => { lines.push(parts.join(" ")); };
  try {
    const problem = { title: "Email opt-in refused", status: 400, detail: 'RecordEmailOptIn: address "Holder <holder.private@example.com>" is not one plain email address' };
    const reference = await logRefusal("Email opt-in", new Response(JSON.stringify(problem), { status: 400 }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("holder.private");
    expect(lines[0]).not.toContain("example.com");
    expect(lines[0]).toContain("is not one plain email address");
    expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(lines[0]).toContain(reference);
  } finally {
    console.warn = warn;
  }
});
