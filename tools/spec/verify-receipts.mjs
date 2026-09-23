/**
 * Independently verifies the batch sealed by tools/seal.
 *
 * This file shares no code with the Go engine. It reimplements the
 * canonicalization, the leaf composition and the Merkle path from
 * spec/canonical/vectors.json and spec/merkle/vectors.json, and then checks a
 * batch the Go engine produced. If the two ever disagree by a byte, this fails.
 *
 * That is the whole point. The Explorer tells a visitor "your browser just
 * verified this, we didn't," and a claim like that is only honest if a receipt
 * sealed by our server genuinely verifies under an implementation that is not
 * our server. This is the smallest honest version of that test, and it runs in
 * CI on every change.
 *
 * Run: node tools/spec/verify-receipts.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Reimplemented from the spec, deliberately not imported from the generator. */

function canonicalize(value) {
  if (value === undefined) throw new Error('undefined is not representable');
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('non-finite number');
      if (!Number.isInteger(value)) throw new Error('non-integer number: ' + value);
      if (!Number.isSafeInteger(value)) throw new Error('integer outside the safe range: ' + value);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

const sha256 = bytes => new Uint8Array(createHash('sha256').update(bytes).digest());
const utf8 = s => new Uint8Array(Buffer.from(s, 'utf8'));
const hex = b => Buffer.from(b).toString('hex');
const unhex = h => new Uint8Array(Buffer.from(h, 'hex'));
const concat = (...p) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) { out.set(x, i); i += x.length; }
  return out;
};

const digestBody = obj => sha256(utf8(canonicalize(obj)));
const leafHash = (pub, priv) => sha256(concat(new Uint8Array([0x00]), pub, priv));
const nodeHash = (l, r) => sha256(concat(new Uint8Array([0x01]), l, r));

function rootFromProof(leaf, path) {
  let current = leaf;
  for (const step of path) {
    const sibling = unhex(step.hash);
    if (step.side === 'left') current = nodeHash(sibling, current);
    else if (step.side === 'right') current = nodeHash(current, sibling);
    else throw new Error('unknown side: ' + step.side);
  }
  return current;
}

/* Verify what Go sealed. */

const batchPath = join(ROOT, 'evidence', 'demo-batch', 'batch.json');
let batch;
try {
  batch = JSON.parse(readFileSync(batchPath, 'utf8'));
} catch (e) {
  console.error(`cannot read ${batchPath}: ${e.message}`);
  console.error('run: go run ./tools/seal');
  process.exit(1);
}

const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(detail ? `${name}: ${detail}` : name); };

console.log(`verifying ${batch.count} receipts sealed by the Go engine`);
console.log(`published root ${batch.root}\n`);

for (const proof of batch.proofs) {
  const publicDigest = digestBody(proof.public_body);
  const leaf = leafHash(publicDigest, unhex(proof.private_commitment));
  const computed = hex(rootFromProof(leaf, proof.path));

  const ok = computed === batch.root && proof.root === batch.root;
  check(`${proof.serial} verifies`, ok, `computed ${computed}`);
  console.log(`  ${proof.serial}  ${ok ? 'verified' : 'FAILED'}  path ${proof.path.length}  ${proof.public_body.kind}`);

  // A public artifact must carry nothing that identifies a holder. Checked
  // here as well as in Go, because this is the side a stranger actually reads.
  const text = JSON.stringify(proof);
  const priv = batch.private_bodies_revealed_for_the_demonstration[proof.serial].body;
  for (const [label, value] of [
    ['wallet', priv.wallet], ['signature', priv.signature],
    ['approved amount', priv.approved_atoms], ['settled amount', priv.settled_atoms],
    ['floor amount', priv.floor_atoms], ['salt', priv.salt],
  ]) {
    check(`${proof.serial} public artifact omits the ${label}`, !text.includes(value));
  }

  // The owner can prove the private body by revealing it with its salt.
  check(`${proof.serial} owner can prove the private body`,
    hex(digestBody(priv)) === proof.private_commitment);

  // And a body with anything altered cannot.
  const altered = { ...priv, settled_atoms: '999999999' };
  check(`${proof.serial} an altered private body does not verify`,
    hex(digestBody(altered)) !== proof.private_commitment);
}

// Tampering with a public body must break the proof, which is the guarantee
// the whole artifact exists to provide.
const first = batch.proofs[0];
for (const [name, mutate] of [
  ['grade', p => { p.public_body.constituents[0].grade = 'entitlement'; }],
  ['size band', p => { p.public_body.size_band = 'over 10,000 USDC'; }],
  ['policy version', p => { p.public_body.policy_version = 'policy-2026.09.4'; }],
  ['an issuer power', p => { p.public_body.constituents[0].issuer_can.pop(); }],
]) {
  const copy = JSON.parse(JSON.stringify(first));
  mutate(copy);
  const leaf = leafHash(digestBody(copy.public_body), unhex(copy.private_commitment));
  check(`changing ${name} breaks the proof`, hex(rootFromProof(leaf, copy.path)) !== batch.root);
}

console.log();
if (failures.length) {
  console.error(`${failures.length} failure(s):`);
  for (const f of failures) console.error('  ' + f);
  console.error('\nThe Go engine and this independent implementation disagree. One of them is wrong,');
  console.error('and until that is resolved the Explorer cannot honestly say a browser verified anything.');
  process.exit(1);
}
console.log(`all ${batch.count} receipts verified by an implementation sharing no code with the one that sealed them`);
