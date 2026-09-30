/**
 * Generates spec/anchor/vectors.json: the exact bytes of a batch root's
 * anchor transaction, built and signed by @solana/web3.js.
 *
 * A separate script from generate.mjs, which imports nothing outside node:
 * the value of this vector is that a widely used Solana library, sharing no
 * code with server/internal/solana, produced it. The Go builder must match
 * these bytes exactly; a Go test reads this file.
 *
 * Run: node shared/tools/spec/anchor-vector.mjs          (writes the vector)
 *      node shared/tools/spec/anchor-vector.mjs --check  (verifies it, writes nothing)
 *
 * Needs `npm ci` first, for @solana/web3.js.
 */

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');

const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
// The memo names its scheme and version, so a reader can tell an anchor from
// any other memo the same key might carry, and a later format cannot be
// mistaken for this one.
const MEMO_PREFIX = 'seametry-root-v1:';

const sha256 = text => createHash('sha256').update(text).digest();

function anchorCase(name, seedLabel, blockhashLabel, root) {
  // Seeds and blockhashes are derived from labels, so the vector is
  // reproducible and no key here was ever a real one.
  const signer = Keypair.fromSeed(sha256(seedLabel));
  const recentBlockhash = new PublicKey(sha256(blockhashLabel)).toBase58();
  const memo = MEMO_PREFIX + root;

  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash });
  tx.add(new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM),
    keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
    data: Buffer.from(memo, 'utf8'),
  }));
  tx.sign(signer);

  return {
    name,
    seed_hex: sha256(seedLabel).toString('hex'),
    signer: signer.publicKey.toBase58(),
    recent_blockhash: recentBlockhash,
    root,
    memo,
    message_base64: tx.serializeMessage().toString('base64'),
    signature_hex: Buffer.from(tx.signature).toString('hex'),
    transaction_base64: tx.serialize().toString('base64'),
  };
}

const demoRoot = JSON.parse(readFileSync(join(ROOT, 'evidence', 'demo-batch', 'batch.json'), 'utf8')).root;
const vectors = {
  note: 'Built and signed by @solana/web3.js. The keys are derived from labels and were never used on any cluster.',
  memo_program: MEMO_PROGRAM,
  memo_prefix: MEMO_PREFIX,
  cases: [
    anchorCase('demo batch root', 'seametry anchor vector key 1', 'seametry anchor vector blockhash 1', demoRoot),
    anchorCase('all zero root', 'seametry anchor vector key 2', 'seametry anchor vector blockhash 2', '00'.repeat(32)),
    anchorCase('all ones root', 'seametry anchor vector key 3', 'seametry anchor vector blockhash 3', 'ff'.repeat(32)),
  ],
};

const rel = 'spec/anchor/vectors.json';
const path = join(ROOT, rel);
const text = JSON.stringify(vectors, null, 2) + '\n';
if (CHECK) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (existing !== text) {
    console.error(`DRIFT: ${rel} differs from what @solana/web3.js produces`);
    process.exit(1);
  }
  console.log(`${rel}: ${vectors.cases.length} anchor transactions match @solana/web3.js`);
} else {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${rel}`);
}
