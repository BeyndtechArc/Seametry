import { expect, test, type APIRequestContext } from "@playwright/test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { messageDigest } from "../src/lib/allocation/approval";
import { conditionsFor, deployment, firstTouchFrom, quoteReport, submissionReport, UNRECOGNISED_PATH, visitReport } from "../src/lib/activity-report";
import { admissions } from "../src/lib/allocation/admissions";
import { preparedLeg, TEST_WALLET } from "./execution-fixture";

type Report = { kind: string; secret: string | null; body: Record<string, unknown> };

async function reports(request: APIRequestContext): Promise<Report[]> {
  return (await request.get("http://127.0.0.1:3846/fixture/activity")).json();
}

const digestOf = (base64: string) => messageDigest(VersionedTransaction.deserialize(Buffer.from(base64, "base64")).message.serialize());

test("a quote report carries every leg's terms and the digest its approval binds", () => {
  const leg = { ...preparedLeg({ mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", symbol: "NVDAx", tipOffsetBps: 6, landing: "sender", tipLamports: "5000" }), id: "0d6a4d2e-1b3c-4e5f-8a7b-9c0d1e2f3a4b" } as Parameters<typeof quoteReport>[0]["legs"][number];
  const report = quoteReport({
    id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f60", wallet: TEST_WALLET, kind: "buy", planSize: 1, preparedAt: new Date("2026-10-16T09:00:00Z"),
    deploymentName: "production", subject: "Prime Seven", legs: [leg],
  });
  expect(report.legs).toHaveLength(1);
  expect(report.legs[0]).toMatchObject({
    mint: leg.mint, symbol: "NVDAx", in: { atoms: "1000000", scale: 6 }, floor: { atoms: "1", scale: 6 },
    routing_fee_bps: 20, tip_offset_bps: 6, simulated_fee_atoms: "2000", tip_lamports: "5000", landing: "sender",
    message_sha256: digestOf(leg.transaction),
  });
  const refused = quoteReport({
    id: "5f0c2f5e-7a1d-4c2b-9b8e-1d2c3b4a5f61", wallet: TEST_WALLET, kind: "sell", planSize: 2, preparedAt: new Date(), deploymentName: "preview",
    legs: [leg], refusal: { status: 402, text: "Add SOL before selling." },
  });
  expect(refused.legs).toEqual([]);
  expect(refused.refusal).toEqual({ status: 402, text: "Add SOL before selling." });
});

test("the conditions name what the policy stated for each stock, once, and a stock it holds nothing for without a decision", () => {
  const warned = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const unknown = "So11111111111111111111111111111111111111112";
  const snapshot = {
    as_of: "2026-09-23T12:00:00+01:00", policy_version: "policy-2026.10.1",
    instruments: [{ instrument: { mint: warned }, capacity_decision: { decision: "WARN", reasons: [{ code: "ISSUER_CAN_FREEZE", severity: "WARN", fact: "The issuer can freeze this account." }] } }],
  };
  expect(conditionsFor([warned, unknown, warned, "not a mint"], snapshot)).toEqual({
    policy_version: "policy-2026.10.1",
    snapshot_at: "2026-09-23T11:00:00.000Z",
    legs: [
      { mint: warned, decision: "WARN", reasons: [{ code: "ISSUER_CAN_FREEZE", severity: "WARN" }] },
      { mint: unknown, reasons: [] },
    ],
  });
  expect(conditionsFor(["not a mint"], snapshot)).toBeUndefined();
  const many = Array.from({ length: 25 }, (_, index) => `${"1".repeat(31)}${"ABCDEFGHJKLMNPQRSTUVWXYZa"[index]}`);
  expect(conditionsFor(many, snapshot)!.legs).toHaveLength(20);
});

test("a first touch keeps only capped strings, and an empty one is none", () => {
  expect(firstTouchFrom({ referrer_host: "x.com", utm_campaign: "c".repeat(300), utm_source: 7, landing_path: "  " })).toEqual({ referrer_host: "x.com", utm_campaign: "c".repeat(200) });
  expect(firstTouchFrom({ utm_source: "" })).toBeUndefined();
  expect(firstTouchFrom("x.com")).toBeUndefined();
  expect(deployment("production")).toBe("production");
  expect(deployment("preview")).toBe("preview");
  expect(deployment(undefined)).toBe("development");
});

test("a submission report says sent, not sent or uncertain, with the signature only when signed", () => {
  const unsigned = preparedLeg().transaction;
  const refused = submissionReport(unsigned, unsigned, new Date("2026-10-16T09:00:05Z"), { sent: false, definitelyNotSent: true, text: "This quote expired." });
  expect(refused).toEqual({ message_sha256: digestOf(unsigned), submitted_at: "2026-10-16T09:00:05.000Z", result: "refused_not_sent", text: "This quote expired." });
  const transaction = VersionedTransaction.deserialize(Buffer.from(unsigned, "base64"));
  const holder = Keypair.generate();
  transaction.signatures[0] = holder.secretKey.slice(0, 64);
  const signed = Buffer.from(transaction.serialize()).toString("base64");
  expect(submissionReport(signed, unsigned, new Date(), { sent: true })).toMatchObject({ result: "sent", signature: expect.any(String) });
  expect(submissionReport(signed, unsigned, new Date(), { sent: false, definitelyNotSent: false, text: "lost" })?.result).toBe("uncertain");
  expect(submissionReport("not a transaction", unsigned, new Date(), { sent: true })).toBeUndefined();
});

test("funnel steps reach the record through the server, with its secret and never the browser's", async ({ request }) => {
  const wallet = Keypair.generate().publicKey.toBase58();
  const quoteId = crypto.randomUUID();
  const response = await request.post("/api/activity/funnel", { data: { events: [{ kind: "review_opened", wallet, quoteId }, { kind: "share_clicked", wallet }] } });
  expect(response.status()).toBe(204);
  await expect.poll(async () => (await reports(request)).filter((report) => report.kind === "funnel" && JSON.stringify(report.body).includes(wallet))).toHaveLength(1);
  const [report] = (await reports(request)).filter((entry) => entry.kind === "funnel" && JSON.stringify(entry.body).includes(wallet));
  expect(report.secret).toBe("fixture-activity-secret");
  expect(report.body).toEqual({ deployment: "development", events: [{ kind: "review_opened", wallet, quote_id: quoteId }, { kind: "share_clicked", wallet }] });

  expect((await request.post("/api/activity/funnel", { data: { events: Array.from({ length: 21 }, () => ({ kind: "review_opened" })) } })).status()).toBe(400);
  expect((await request.post("/api/activity/funnel", { data: { events: [{ kind: 3 }] } })).status()).toBe(400);
});

test("a refused purchase is recorded with its reason, its wallet and no legs", async ({ request }) => {
  const wallet = Keypair.generate().publicKey.toBase58();
  const mint = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
  const response = await request.post("/api/allocation/prepare-batch", {
    data: { wallet, legs: [{ mint, usdcAtoms: "1000000" }, { mint, usdcAtoms: "1000000" }], planMints: [mint], subject: "Prime Seven", firstTouch: { referrer_host: "x.com" } },
  });
  expect(response.status()).toBe(400);
  await expect.poll(async () => (await reports(request)).filter((report) => report.kind === "quotes" && report.body.wallet === wallet)).toHaveLength(1);
  const [report] = (await reports(request)).filter((entry) => entry.kind === "quotes" && entry.body.wallet === wallet);
  expect(report.body).toMatchObject({
    kind: "buy", network: "mainnet", plan_size: 1, subject: "Prime Seven", deployment: "development",
    first_touch: { referrer_host: "x.com" }, legs: [], refusal: { status: 400, text: "The Allocation names a constituent more than once." },
  });
  // A refusal still records what the policy stated for the stock it named, once.
  const admission = admissions.instruments.find((entry) => entry.instrument.mint === mint)!;
  expect(report.body.conditions).toEqual({
    policy_version: admissions.policy_version,
    snapshot_at: new Date(admissions.as_of).toISOString(),
    legs: [{ mint, decision: admission.capacity_decision.decision, reasons: admission.capacity_decision.reasons.map(({ code, severity }) => ({ code, severity })) }],
  });
});

test("a submission the server refuses before sending is recorded as not sent, by its digest", async ({ request }) => {
  const transaction = preparedLeg().transaction;
  const response = await request.post("/api/allocation/submit", { data: { transaction, approved: transaction, approval: "not-an-approval" } });
  expect(response.status()).toBeGreaterThanOrEqual(400);
  expect((await response.json()).sent).toBe(false);
  const digest = digestOf(transaction);
  await expect.poll(async () => (await reports(request)).filter((report) => report.kind === "submissions" && report.body.message_sha256 === digest)).toHaveLength(1);
  const [report] = (await reports(request)).filter((entry) => entry.kind === "submissions" && entry.body.message_sha256 === digest);
  expect(report.body).toMatchObject({ result: "refused_not_sent" });
  expect(report.body.signature).toBeUndefined();
});

test("a visit report carries a page and a code and nothing else, and keeps a path the count cannot hold as unrecognised", () => {
  expect(visitReport("/thesis", "x", "production")).toEqual({ deployment: "production", landing_path: "/thesis", ref_code: "x" });
  // A dm-<handle> names the person a message went to; the count keeps only its channel.
  expect(visitReport("/thesis", "dm-storm", "production")).toEqual({ deployment: "production", landing_path: "/thesis", ref_code: "dm" });
  expect(visitReport("/", undefined, "preview")).toEqual({ deployment: "preview", landing_path: "/" });
  expect(visitReport("/caf%C3%A9", "x", "production")).toEqual({ deployment: "production", landing_path: UNRECOGNISED_PATH, ref_code: "x" });
  expect(visitReport(42, "Not A Code", "production")).toEqual({ deployment: "production", landing_path: UNRECOGNISED_PATH });
});

test("an entry is counted by its page and referral code, with no identifier and nothing kept in the browser", async ({ page, request, baseURL }) => {
  // A path no other test opens, so this test's reports are told apart from
  // those of tests running beside it; an unknown path still renders the layout.
  const path = `/visit-entry-${Date.now().toString(36)}`;
  const ofThisPath = async () => (await reports(request)).filter((report) => report.kind === "visits" && report.body.landing_path === path);
  // Its own address, so the suite's other page loads cannot use up its limit.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Date.now() % 250}` });
  await page.goto(`${path}?ref=dm-someone`, { referer: "https://x.com/" });
  await expect.poll(ofThisPath).toHaveLength(1);
  const [report] = await ofThisPath();
  expect(report.secret).toBe("fixture-activity-secret");
  expect(report.body).toEqual({ deployment: "development", landing_path: path, ref_code: "dm" });
  const kept = await page.evaluate(() => [...Object.keys(sessionStorage), ...Object.keys(localStorage)].filter((key) => /visit/i.test(key)));
  expect(kept).toEqual([]);
  // A page load from inside the site is not an entry.
  await page.goto(path, { referer: `${baseURL}/thesis` });
  await page.waitForTimeout(1000);
  expect(await ofThisPath()).toHaveLength(1);
});

test("past the limit an entry goes uncounted and the page still gets no error", async ({ request }) => {
  const path = `/visit-limit-${Date.now().toString(36)}`;
  const headers = { "x-forwarded-for": `203.0.113.${Date.now() % 250}` };
  for (let visit = 0; visit < 61; visit++) {
    const response = await request.post("/api/activity/visits", { headers, data: { path } });
    expect(response.status()).toBe(204);
  }
  const counted = async () => (await reports(request)).filter((report) => report.kind === "visits" && report.body.landing_path === path).length;
  await expect.poll(counted).toBe(60);
  await new Promise((settled) => setTimeout(settled, 500));
  expect(await counted()).toBe(60);
});

test("the visit route refuses a body without a path", async ({ request }) => {
  const response = await request.post("/api/activity/visits", { data: { ref: "x" } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain("path");
});
