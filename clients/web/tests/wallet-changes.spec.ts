import { expect, test, type APIRequestContext } from "@playwright/test";
import { AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { messageDigest, signApproval } from "../src/lib/allocation/approval";
import { LIGHTHOUSE_PROGRAM, walletChanges } from "../src/lib/allocation/wallet-changes";
import { admissions } from "../src/lib/allocation/admissions";
import { TEST_WALLET, answerChain, preparedLeg } from "./execution-fixture";
import { registerTestWallet } from "./test-wallet";

// A leg shaped as Seametry builds one: compute budget, a swap through a
// program reading accounts from a lookup table, and a Sender tip.
const payer = new PublicKey(TEST_WALLET);
const swapProgram = Keypair.generate().publicKey;
const pool = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
const table = new AddressLookupTableAccount({
  key: Keypair.generate().publicKey,
  state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: pool },
});
const blockhash = Keypair.generate().publicKey.toBase58();
const swap = new TransactionInstruction({
  programId: swapProgram,
  keys: [{ pubkey: payer, isSigner: true, isWritable: true }, { pubkey: pool[0], isSigner: false, isWritable: true }, { pubkey: pool[1], isSigner: false, isWritable: false }],
  data: Buffer.from([7, 1, 2, 3]),
});
const tip = SystemProgram.transfer({ fromPubkey: payer, toPubkey: pool[3], lamports: 5_000 });
const budget = (units: number) => [ComputeBudgetProgram.setComputeUnitLimit({ units }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })];
// Phantom's guard: an assertion over the pool account the swap reads.
const guard = new TransactionInstruction({ programId: new PublicKey(LIGHTHOUSE_PROGRAM), keys: [{ pubkey: pool[1], isSigner: false, isWritable: false }], data: Buffer.from([9, 9]) });

const message = (instructions: TransactionInstruction[], payerKey = payer) =>
  new TransactionMessage({ payerKey, recentBlockhash: blockhash, instructions }).compileToV0Message([table]);
const approved = message([...budget(200_000), swap, tip]);
const base64 = (compiled: ReturnType<typeof message>) => Buffer.from(new VersionedTransaction(compiled).serialize()).toString("base64");

test("a wallet may add Lighthouse guards and change the fee budget, and nothing else", () => {
  expect(walletChanges(approved, approved)).toBeUndefined();
  // Phantom's changes, recompiled: guards before and after, a higher compute limit.
  expect(walletChanges(approved, message([guard, ...budget(260_000), swap, tip, guard]))).toBeUndefined();

  const otherData = new TransactionInstruction({ ...swap, data: Buffer.from([7, 1, 2, 4]) });
  expect(walletChanges(approved, message([...budget(200_000), otherData, tip]))).toBe(`instruction 1 (${swapProgram.toBase58()}) has different accounts or data`);
  const stranger = SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1 });
  expect(walletChanges(approved, message([...budget(200_000), swap, tip, stranger]))).toBe(`instruction 3 (${SystemProgram.programId.toBase58()}) was added`);
  expect(walletChanges(approved, message([...budget(200_000), swap]))).toBe(`instruction 2 (${SystemProgram.programId.toBase58()}) is missing`);
  // A second payer beside the holder is a second signature asked for.
  expect(walletChanges(approved, message([...budget(200_000), swap, tip], Keypair.generate().publicKey))).toBe("it asks for 2 signatures, not 1");
  // The same trade paid and signed by someone else.
  const other = Keypair.generate().publicKey;
  const theirs = [...budget(200_000), new TransactionInstruction({ ...swap, keys: [{ pubkey: other, isSigner: true, isWritable: true }, ...swap.keys.slice(1)] }), SystemProgram.transfer({ fromPubkey: other, toPubkey: pool[3], lamports: 5_000 })];
  expect(walletChanges(approved, message(theirs, other))).toBe("the fee payer changed");
  // A guard that makes the pool account writable changes what the swap may do.
  const writableGuard = new TransactionInstruction({ ...guard, keys: [{ pubkey: pool[1], isSigner: false, isWritable: true }] });
  expect(walletChanges(approved, message([...budget(200_000), swap, tip, writableGuard]))).toBe(`instruction 1 (${swapProgram.toBase58()}) has different accounts or data`);
  // A guard is only Lighthouse\x27s: another program in its place is an added instruction.
  const lookalike = new TransactionInstruction({ ...guard, programId: Keypair.generate().publicKey });
  expect(walletChanges(approved, message([...budget(200_000), swap, tip, lookalike]))).toMatch(/^instruction 3 \(.+\) was added$/);
});

test("a one-stock buy a wallet guards is sent with the transaction Seametry approved", async ({ page }) => {
  const original = base64(approved);
  const guarded = base64(message([...budget(260_000), swap, tip, guard]));
  await registerTestWallet(page, { trusted: true, signs: true, rewrites: { [original]: guarded } });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: [preparedLeg({ transaction: original, mint: aapl.instrument.mint, symbol: "AAPLx" })] }));
  const submitted: { transaction: string; approved: string; approval: string }[] = [];
  await page.route("**/api/allocation/submit", (route) => {
    submitted.push(route.request().postDataJSON());
    return route.fulfill({ json: { signature: "answered" } });
  });
  await answerChain(page, () => ({ phase: "sent" }));

  await page.goto(`/app/allocation?selected=${aapl.instrument.mint}&amount=1`);
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Buy allocation" }).click();

  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].approved).toBe(original);
  expect(submitted[0].approval).toBe("test-approval");
  const sent = VersionedTransaction.deserialize(Buffer.from(submitted[0].transaction, "base64"));
  expect(walletChanges(approved, sent.message)).toBeUndefined();
  expect(sent.message.staticAccountKeys.map((key) => key.toBase58())).toContain(LIGHTHOUSE_PROGRAM);
});

test("a one-stock buy a wallet changes beyond its guards is stopped before anything is sent, saying what changed", async ({ page }) => {
  const original = base64(approved);
  const stranger = SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1 });
  const tampered = base64(message([...budget(200_000), swap, tip, stranger]));
  await registerTestWallet(page, { trusted: true, signs: true, rewrites: { [original]: tampered } });
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  await page.route("**/api/allocation/prepare-batch", (route) => route.fulfill({ json: [preparedLeg({ transaction: original, mint: aapl.instrument.mint, symbol: "AAPLx" })] }));
  let submits = 0;
  await page.route("**/api/allocation/submit", (route) => { submits += 1; return route.fulfill({ status: 500, json: { error: "must not be called" } }); });

  await page.goto(`/app/allocation?selected=${aapl.instrument.mint}&amount=1`);
  await page.getByText("Sign in", { exact: true }).click();
  await page.getByRole("button", { name: "Connect Test wallet" }).click();
  await page.getByRole("button", { name: "Buy allocation" }).click();

  await expect(page.getByText(`The wallet changed the AAPLx transaction Seametry checked: instruction 3 (${SystemProgram.programId.toBase58()}) was added. Nothing was sent.`, { exact: false }).first()).toBeVisible();
  expect(submits).toBe(0);
});

// The fixture deployment's approval secret (playwright.config.ts), test-only.
const FIXTURE_SECRET = "fixture-only-not-a-production-secret-00000000";

async function reports(request: APIRequestContext): Promise<{ kind: string; body: Record<string, unknown> }[]> {
  return (await request.get("http://127.0.0.1:3846/fixture/activity")).json();
}

test("the server sends a guarded leg on its approval, and refuses a changed one saying what changed", async ({ request }) => {
  const aapl = admissions.instruments.find((lot) => lot.instrument.symbol === "AAPLx")!;
  const approval = signApproval({
    direction: "buy", wallet: TEST_WALLET, mint: aapl.instrument.mint,
    inputDigest: aapl.capacity_decision.input_digest, policyVersion: aapl.capacity_decision.policy_version,
    inAtoms: "1000000", outAtoms: "1", floorAtoms: "1",
    messageSha256: messageDigest(approved.serialize()), expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, FIXTURE_SECRET);
  const signedBy = (compiled: ReturnType<typeof message>) => {
    const transaction = new VersionedTransaction(compiled);
    transaction.signatures[0] = new Uint8Array(64).fill(3);
    return Buffer.from(transaction.serialize()).toString("base64");
  };
  const submit = (transaction: string) => request.post("/api/allocation/submit", { data: { transaction, approved: base64(approved), approval } });

  const guarded = await submit(signedBy(message([...budget(260_000), swap, tip, guard])));
  // Past every check of what was signed: whatever the network answers, it is not a change.
  expect(guarded.status()).not.toBe(409);
  expect(JSON.stringify(await guarded.json())).not.toContain("changed after it was approved");

  const stranger = SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1 });
  const changed = await submit(signedBy(message([...budget(200_000), swap, tip, stranger])));
  expect(changed.status()).toBe(409);
  const body = await changed.json();
  expect(body).toMatchObject({ code: "SIGNED_MESSAGE_CHANGED", sent: false });
  expect(body.error).toBe(`The transaction was changed after it was approved (instruction 3 (${SystemProgram.programId.toBase58()}) was added), so it was not sent. Prepare the leg again.`);
  // Reported against the leg it was approved as, so the team can read what the wallet changed.
  const digest = messageDigest(approved.serialize());
  await expect.poll(async () => (await reports(request)).filter((report) => report.kind === "submissions" && report.body.message_sha256 === digest && String(report.body.text).includes("was added"))).toHaveLength(1);
});
