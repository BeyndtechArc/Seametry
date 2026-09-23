/**
 * Generates and self-checks the language neutral conformance vectors in spec/.
 *
 * These vectors bind every implementation: Go now, Rust later, and the
 * browser side verifier in the Explorer. A vector is never edited to make an
 * implementation pass. See docs/ENGINEERING_STANDARD.md sections 8 and 17.
 *
 * Run: node tools/spec/generate.mjs        (writes vectors, exits non-zero on any self-check failure)
 *      node tools/spec/generate.mjs --check (verifies on-disk vectors match, writes nothing)
 */
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * Canonicalization: RFC 8785 (JCS), with one Seametry restriction.
 * ------------------------------------------------------------------ */

/**
 * Seametry restriction beyond JCS: a non-integer JSON number is refused.
 * Amounts travel as integer atoms plus an explicit scale, so a fractional
 * number in a canonical body means a float leaked into a domain contract.
 * Refusing here is the cheapest place to catch it.
 */
export function canonicalize(value) {
  if (value === undefined) throw new Error('undefined is not representable');
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('non-finite number: ' + value);
      if (!Number.isInteger(value)) throw new Error('non-integer number: ' + value);
      // Beyond the IEEE-754 safe integer range a JavaScript implementation
      // cannot represent the value exactly, so it cannot be made to agree with
      // a Go or Rust one. Refusing here is what keeps the vectors binding on
      // all three. Larger magnitudes travel as strings.
      if (!Number.isSafeInteger(value)) throw new Error('integer outside the safe range: ' + value);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  // JCS orders members by the UTF-16 code units of the key, which is what
  // Array.prototype.sort gives for JavaScript strings.
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
}

const sha256 = bytes => new Uint8Array(createHash('sha256').update(bytes).digest());
const utf8 = s => new Uint8Array(Buffer.from(s, 'utf8'));
const hex = b => Buffer.from(b).toString('hex');
const unhex = h => new Uint8Array(Buffer.from(h, 'hex'));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export const digestBody = obj => sha256(utf8(canonicalize(obj)));

/* ------------------------------------------------------------------ *
 * Merkle: RFC 6962 tree geometry, Seametry leaf composition.
 *
 * The mock's pairwise fold breaks on any count that is not a power of two,
 * and the obvious repair (duplicate the final node) is CVE-2012-2459: it
 * makes an n-leaf tree collide with an n+1-leaf tree. RFC 6962 splits at the
 * largest power of two strictly less than n, which is defined for every n
 * and has no such collision.
 * ------------------------------------------------------------------ */

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

/** leaf = SHA-256( 0x00 || H(public_body) || H(private_body_with_salt) ) */
export const leafHash = (hPublic, hPrivate) => sha256(concat(LEAF_PREFIX, hPublic, hPrivate));

/** interior = SHA-256( 0x01 || left || right ) */
export const nodeHash = (left, right) => sha256(concat(NODE_PREFIX, left, right));

/** Largest power of two strictly less than n. Defined for n >= 2. */
export function splitPoint(n) {
  if (n < 2) throw new Error('splitPoint requires n >= 2');
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/**
 * Merkle tree hash over already-domain-separated leaves.
 * An empty tree is the hash of the empty string, per RFC 6962.
 * A single leaf is itself: the 0x00 prefix was applied in leafHash.
 */
export function merkleRoot(leaves) {
  if (leaves.length === 0) return sha256(new Uint8Array(0));
  if (leaves.length === 1) return leaves[0];
  const k = splitPoint(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** RFC 6962 audit path for leaf `index`, ordered leaf-ward to root-ward. */
export function inclusionProof(leaves, index) {
  if (index < 0 || index >= leaves.length) throw new Error('index out of range');
  if (leaves.length === 1) return [];
  const k = splitPoint(leaves.length);
  if (index < k) {
    return [
      ...inclusionProof(leaves.slice(0, k), index),
      { side: 'right', hash: hex(merkleRoot(leaves.slice(k))) },
    ];
  }
  return [
    ...inclusionProof(leaves.slice(k), index - k),
    { side: 'left', hash: hex(merkleRoot(leaves.slice(0, k))) },
  ];
}

/** Recomputes a root from a leaf and its audit path. This is what a verifier runs. */
export function rootFromProof(leaf, proof) {
  let current = leaf;
  for (const step of proof) {
    const sibling = unhex(step.hash);
    current = step.side === 'left' ? nodeHash(sibling, current) : nodeHash(current, sibling);
  }
  return current;
}

/* ------------------------------------------------------------------ *
 * Vectors
 * ------------------------------------------------------------------ */

const canonicalVectors = {
  scheme: 'RFC 8785 (JCS), restricted: a JSON number must be an integer in int64 range',
  note: 'Every implementation must produce `canonical` byte for byte, and must refuse every case in `rejects`.',
  number_rule:
    'A JSON number in a canonical body must be an integer in the IEEE-754 safe range, -(2^53 - 1) to (2^53 - 1) inclusive. Every fractional value and every magnitude beyond that range is a string. ' +
    'The bound is the safe-integer range rather than int64 because JavaScript cannot represent int64 extremes exactly, so an int64 bound would be one no browser-side verifier could ever satisfy. ' +
    'This also removes ECMAScript exponential number formatting from the specification entirely, which is the largest source of divergence between JCS implementations, and it is consistent with amounts travelling as integer atoms plus an explicit scale.',
  key_order_rule:
    'Members are ordered by the UTF-16 code units of the key, per JCS. This is NOT the same as ordering by UTF-8 bytes: a key above U+FFFF encodes to a surrogate pair beginning 0xD800..0xDBFF, which sorts before U+E000..U+FFFF in UTF-16 but after it in UTF-8. The "surrogate pair sorts before U+FFFD" vector below is the one that catches an implementation which sorted raw bytes.',
  accepts: [
    { name: 'empty object', input: {}, canonical: '{}' },
    { name: 'empty array', input: [], canonical: '[]' },
    { name: 'literals', input: { t: true, f: false, n: null }, canonical: '{"f":false,"n":null,"t":true}' },
    { name: 'key order is UTF-16 code unit order', input: { z: 1, a: 2, M: 3, '0': 4 }, canonical: '{"0":4,"M":3,"a":2,"z":1}' },
    { name: 'non-ASCII keys sort after ASCII', input: { 'é': 1, z: 2, a: 3 }, canonical: '{"a":3,"z":2,"é":1}' },
    { name: 'surrogate pair key sorts by code unit', input: { '😀': 1, 'z': 2 }, canonical: '{"z":2,"😀":1}' },
    {
      name: 'surrogate pair sorts before U+FFFD (UTF-16 order, not UTF-8 byte order)',
      input: { '�': 1, '\u{10000}': 2 },
      canonical: '{"\u{10000}":2,"�":1}',
      catches: 'An implementation that sorts keys by UTF-8 bytes emits these in the opposite order, because U+FFFD begins 0xEF and U+10000 begins 0xF0, while in UTF-16 the surrogate 0xD800 precedes 0xFFFD.',
    },
    { name: 'nested objects sort at every level', input: { b: { d: 1, c: 2 }, a: 3 }, canonical: '{"a":3,"b":{"c":2,"d":1}}' },
    { name: 'array order is preserved', input: { a: [3, 1, 2] }, canonical: '{"a":[3,1,2]}' },
    { name: 'control characters escape', input: { k: 'a\tb\nc' }, canonical: '{"k":"a\\tb\\nc"}' },
    { name: 'quote and backslash escape', input: { k: 'a"b\\c' }, canonical: '{"k":"a\\"b\\\\c"}' },
    { name: 'non-ASCII is emitted raw, not escaped', input: { k: 'héllo' }, canonical: '{"k":"héllo"}' },
    { name: 'negative zero collapses to zero', input: { n: -0 }, canonical: '{"n":0}' },
    { name: 'negative integer', input: { n: -42 }, canonical: '{"n":-42}' },
    { name: 'largest safe integer', input: { n: 9007199254740991 }, canonical: '{"n":9007199254740991}' },
    { name: 'smallest safe integer', input: { n: -9007199254740991 }, canonical: '{"n":-9007199254740991}' },
    { name: 'amounts travel as integer atoms plus scale', input: { amount_atoms: '123456789', scale: 6 }, canonical: '{"amount_atoms":"123456789","scale":6}' },
  ],
  rejects: [
    { name: 'fractional number', input: { n: 1.5 }, reason: 'non-integer number' },
    { name: 'fractional number inside an array', input: { a: [1, 2.5] }, reason: 'non-integer number' },
    { name: 'price as a float', input: { price: 248.37 }, reason: 'non-integer number' },
    { name: 'first unsafe integer', input: { n: 9007199254740992 }, reason: 'integer outside the safe range' },
    { name: 'magnitude at the 1e21 boundary', input: { n: 1e21 }, reason: 'integer outside the safe range' },
  ],
  // Non-finite numbers are refused by every implementation, but they cannot
  // appear as vectors: JSON has no way to write them, and serializing them
  // here would silently turn them into null, which is a value the accepts list
  // requires to be valid. They are asserted in code instead. See the
  // round-trip self-check below, which exists to stop this recurring.
  refused_but_not_expressible_as_vectors: ['Infinity', '-Infinity', 'NaN', 'undefined'],
};

function buildMerkleVectors() {
  // Deterministic synthetic leaves. Values are arbitrary but fixed.
  const leafFor = i => leafHash(sha256(utf8(`public-${i}`)), sha256(utf8(`private-${i}`)));

  const trees = [];
  for (const n of [0, 1, 2, 3, 4, 5, 7, 8, 9, 16, 17]) {
    const leaves = Array.from({ length: n }, (_, i) => leafFor(i));
    const root = merkleRoot(leaves);
    const proofs = leaves.map((leaf, i) => ({
      index: i,
      leaf: hex(leaf),
      path: inclusionProof(leaves, i),
    }));
    trees.push({
      leaf_count: n,
      root: hex(root),
      // Proofs are exhaustive for small trees and sampled for larger ones, to
      // keep the file reviewable without losing edge coverage.
      proofs: n <= 9 ? proofs : [proofs[0], proofs[Math.floor(n / 2)], proofs[n - 1]],
    });
  }

  return {
    scheme: 'RFC 6962 tree geometry; leaf = SHA-256(0x00 || H(public) || H(private)); interior = SHA-256(0x01 || left || right)',
    note: 'Leaves here are synthetic: leaf(i) = SHA-256(0x00 || SHA-256("public-i") || SHA-256("private-i")). An empty tree is SHA-256 of the empty string. A single-leaf tree is that leaf, because the 0x00 prefix is already applied at leaf construction.',
    split_rule: 'For n >= 2, split at the largest power of two strictly less than n. Never duplicate the final node: that is CVE-2012-2459 and it makes an n-leaf tree collide with an n+1-leaf tree.',
    trees,
  };
}

/* ------------------------------------------------------------------ *
 * Self-checks. These run every time and failing one is a build failure.
 * ------------------------------------------------------------------ */

const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(detail ? `${name}: ${detail}` : name); };

function selfCheck(merkleVectors) {
  // Canonicalization: every accept round-trips, every reject throws.
  for (const v of canonicalVectors.accepts) {
    let got;
    try { got = canonicalize(v.input); } catch (e) { got = 'THREW: ' + e.message; }
    check(`canonical accepts "${v.name}"`, got === v.canonical, `expected ${v.canonical} got ${got}`);
  }
  for (const v of canonicalVectors.rejects) {
    let threw = false;
    try { canonicalize(v.input); } catch { threw = true; }
    check(`canonical rejects "${v.name}"`, threw, 'did not throw');
  }

  // Determinism: key insertion order must not affect the output.
  check('canonical is insertion-order independent',
    canonicalize({ a: 1, b: { c: 2, d: 3 } }) === canonicalize({ b: { d: 3, c: 2 }, a: 1 }));

  // Non-finite values are refused in code even though they cannot be vectors.
  for (const [name, value] of [['Infinity', Infinity], ['-Infinity', -Infinity], ['NaN', NaN], ['undefined', undefined]]) {
    let threw = false;
    try { canonicalize({ n: value }); } catch { threw = true; }
    check(`canonical refuses ${name}`, threw, 'did not throw');
  }

  // Every vector must survive a JSON round-trip unchanged. Without this,
  // a value the generator holds in memory can mean something different on
  // disk: Infinity became null here once, which contradicted another vector.
  for (const v of [...canonicalVectors.accepts, ...canonicalVectors.rejects]) {
    const onDisk = JSON.parse(JSON.stringify(v.input));
    check(`vector "${v.name}" survives a JSON round-trip`,
      JSON.stringify(onDisk) === JSON.stringify(v.input),
      `in memory ${JSON.stringify(v.input)} becomes ${JSON.stringify(onDisk)} on disk`);
  }

  // Every stored proof recomputes its stored root.
  for (const tree of merkleVectors.trees) {
    for (const p of tree.proofs) {
      const got = hex(rootFromProof(unhex(p.leaf), p.path));
      check(`merkle proof n=${tree.leaf_count} i=${p.index}`, got === tree.root, `recomputed ${got} expected ${tree.root}`);
    }
    const expectedDepth = tree.leaf_count <= 1 ? 0 : Math.ceil(Math.log2(tree.leaf_count));
    for (const p of tree.proofs) {
      check(`merkle proof length n=${tree.leaf_count} i=${p.index}`, p.path.length <= expectedDepth,
        `path length ${p.path.length} exceeds ceil(log2(n))=${expectedDepth}`);
    }
  }

  // A tampered leaf must not verify against the root.
  const leaves4 = Array.from({ length: 4 }, (_, i) => leafHash(sha256(utf8(`public-${i}`)), sha256(utf8(`private-${i}`))));
  const tampered = leafHash(sha256(utf8('public-0-tampered')), sha256(utf8('private-0')));
  check('tampered leaf does not verify',
    hex(rootFromProof(tampered, inclusionProof(leaves4, 0))) !== hex(merkleRoot(leaves4)));

  // CVE-2012-2459: under RFC 6962 geometry, a 3-leaf tree must not collide
  // with the 4-leaf tree formed by duplicating its final leaf.
  const three = leaves4.slice(0, 3);
  const duplicated = [...three, three[2]];
  check('no duplicate-node collision (CVE-2012-2459)',
    hex(merkleRoot(three)) !== hex(merkleRoot(duplicated)),
    'a 3-leaf root collided with a 4-leaf root built by duplicating the last leaf');

  // The mock's failure mode, asserted as a property: every count must build.
  for (let n = 1; n <= 33; n++) {
    const leaves = Array.from({ length: n }, (_, i) => leafFor2(i));
    let ok = true;
    try { merkleRoot(leaves); for (let i = 0; i < n; i++) inclusionProof(leaves, i); } catch { ok = false; }
    check(`tree builds at n=${n}`, ok, 'threw while building or proving');
  }

  // Leaf composition is order sensitive: public and private are not interchangeable.
  const a = sha256(utf8('A')), b = sha256(utf8('B'));
  check('leaf composition is order sensitive', hex(leafHash(a, b)) !== hex(leafHash(b, a)));

  // Domain separation: a leaf must never equal an interior node of the same inputs.
  check('leaf and interior prefixes differ', hex(leafHash(a, b)) !== hex(nodeHash(a, b)));
}

const leafFor2 = i => leafHash(sha256(utf8(`public-${i}`)), sha256(utf8(`private-${i}`)));

/* ------------------------------------------------------------------ *
 * Write or check
 * ------------------------------------------------------------------ */

const merkleVectors = buildMerkleVectors();
selfCheck(merkleVectors);

const outputs = [
  ['spec/canonical/vectors.json', canonicalVectors],
  ['spec/merkle/vectors.json', merkleVectors],
];

let drift = false;
for (const [rel, data] of outputs) {
  const path = join(ROOT, rel);
  const text = JSON.stringify(data, null, 2) + '\n';
  if (CHECK) {
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (existing !== text) { console.error(`DRIFT: ${rel} differs from generator output`); drift = true; }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    console.log(`wrote ${rel}`);
  }
}

if (failures.length) {
  console.error(`\n${failures.length} self-check failure(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
if (drift) process.exit(1);

const proofCount = merkleVectors.trees.reduce((n, t) => n + t.proofs.length, 0);
console.log(`\nself-checks passed: ${canonicalVectors.accepts.length} canonical accepts, ${canonicalVectors.rejects.length} rejects, ${merkleVectors.trees.length} trees, ${proofCount} inclusion proofs, 33 tree sizes, CVE-2012-2459 non-collision`);
