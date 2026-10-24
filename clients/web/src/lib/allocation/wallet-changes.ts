import { ComputeBudgetProgram, type VersionedMessage } from "@solana/web3.js";

// What a wallet may change in a leg Seametry approved, and nothing more.
// ENGINEERING_STANDARD.md section 11 binds an approval to the message and
// says any material change invalidates it. Phantom makes two changes that are
// not material, on every transaction it can simulate with confidence (Storm,
// 24 October 2026: a one-stock buy was refused as "changed" while a two-stock
// buy, which Phantom cannot simulate and leaves alone, landed):
//   - it adds Lighthouse guard instructions, which only make the transaction
//     fail if the chain differs from Phantom's simulation;
//   - it may add or change compute-budget instructions, which set the network
//     fee the holder sees and approves in the wallet itself.
// The approval binds the trade: the payer, the blockhash, the one signer, and
// every other instruction with its program, accounts, their writability and
// its data, in order. Those must be exactly as approved.

/** Lighthouse, the assertion program Phantom's guard instructions call. */
export const LIGHTHOUSE_PROGRAM = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";
const COMPUTE_BUDGET_PROGRAM = ComputeBudgetProgram.programId.toBase58();

/**
 * Each instruction written as its program, its accounts and its data, with
 * every account named the same way in both messages: a static account by its
 * address, a looked-up one by its table and index. A recompiled message
 * renumbers indices but cannot rename these.
 */
function instructionsOf(message: VersionedMessage) {
  const statics = message.staticAccountKeys.map((key) => key.toBase58());
  const lookups = message.addressTableLookups ?? [];
  const looked = [
    ...lookups.flatMap((lookup) => lookup.writableIndexes.map((index) => `${lookup.accountKey.toBase58()}#${index}`)),
    ...lookups.flatMap((lookup) => lookup.readonlyIndexes.map((index) => `${lookup.accountKey.toBase58()}#${index}`)),
  ];
  const name = (index: number) => (index < statics.length ? statics[index] : looked[index - statics.length] ?? `missing#${index}`);
  return message.compiledInstructions.map((instruction) => {
    const program = name(instruction.programIdIndex);
    const accounts = instruction.accountKeyIndexes.map((index) => {
      const signer = index < message.header.numRequiredSignatures ? "s" : "";
      return `${name(index)}:${message.isAccountWritable(index) ? "w" : "r"}${signer}`;
    });
    return { program, line: `${program}|${accounts.join(",")}|${Buffer.from(instruction.data).toString("base64")}` };
  });
}

/**
 * Undefined when the signed message is the approved one with at most
 * Lighthouse guards added and compute-budget instructions changed; otherwise
 * what differs, in words a holder and the team can act on.
 */
export function walletChanges(approved: VersionedMessage, signed: VersionedMessage): string | undefined {
  if (approved.version !== signed.version) return `the message version changed from ${approved.version} to ${signed.version}`;
  if (signed.header.numRequiredSignatures !== approved.header.numRequiredSignatures) {
    return `it asks for ${signed.header.numRequiredSignatures} signatures, not ${approved.header.numRequiredSignatures}`;
  }
  if (!signed.staticAccountKeys[0]?.equals(approved.staticAccountKeys[0])) return "the fee payer changed";
  if (signed.recentBlockhash !== approved.recentBlockhash) return "the blockhash changed";

  const trade = (lines: ReturnType<typeof instructionsOf>, allowGuards: boolean) =>
    lines.filter((instruction) => instruction.program !== COMPUTE_BUDGET_PROGRAM && !(allowGuards && instruction.program === LIGHTHOUSE_PROGRAM));
  const before = trade(instructionsOf(approved), false);
  const after = trade(instructionsOf(signed), true);
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index++) {
    if (before[index]?.line === after[index]?.line) continue;
    if (!after[index]) return `instruction ${index + 1} (${before[index].program}) is missing`;
    if (!before[index]) return `instruction ${index + 1} (${after[index].program}) was added`;
    return before[index].program === after[index].program
      ? `instruction ${index + 1} (${before[index].program}) has different accounts or data`
      : `instruction ${index + 1} calls ${after[index].program} instead of ${before[index].program}`;
  }
  return undefined;
}
