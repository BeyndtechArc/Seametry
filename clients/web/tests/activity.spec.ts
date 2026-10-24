import { expect, test, type APIRequestContext } from "@playwright/test";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { messageDigest } from "../src/lib/allocation/approval";
import { deployment, firstTouchFrom, quoteReport, submissionReport } from "../src/lib/activity-report";
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
