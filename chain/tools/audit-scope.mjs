#!/usr/bin/env node
// Writes chain/AUDIT_SCOPE.md: the Hall program's audit scope, measured from
// its source, and the audit grant application that quotes it. The figures in
// an application are read by an auditor quoting a price, so they come from
// the code, not from memory, and --check fails once the program has changed
// since the scope was written: regenerate, then edit the submitted
// application to match before the audit starts.
//
//   node chain/tools/audit-scope.mjs           write chain/AUDIT_SCOPE.md
//   node chain/tools/audit-scope.mjs --check   exit 1 if it is out of date
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const program = join(root, "chain", "programs", "hall");
const output = join(root, "chain", "AUDIT_SCOPE.md");

const posix = (path) => relative(root, path).split("\\").join("/");
// Git may check files out with CRLF on Windows; the scope must not depend on it.
const read = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function rustFiles(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? rustFiles(path) : path.endsWith(".rs") ? [path] : [];
    })
    .sort((a, b) => posix(a).localeCompare(posix(b)));
}

/** Lines that hold code, comment (line, block and doc comments) or nothing. */
function lines(text) {
  let code = 0, comment = 0, blank = 0, inBlock = false;
  const all = text.split("\n");
  if (all.at(-1) === "") all.pop();
  for (const raw of all) {
    const line = raw.trim();
    if (inBlock) { comment++; if (line.includes("*/")) inBlock = false; continue; }
    if (line === "") { blank++; continue; }
    if (line.startsWith("//")) { comment++; continue; }
    if (line.startsWith("/*")) { comment++; if (!line.includes("*/")) inBlock = true; continue; }
    code++;
  }
  return { code, comment, blank };
}

const sources = rustFiles(join(program, "src")).map((path) => ({ path: posix(path), text: read(path) }));
const tests = rustFiles(join(program, "tests")).map((path) => ({ path: posix(path), text: read(path) }));

const counted = sources.map((file) => ({ path: file.path, ...lines(file.text) }));
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const sourceCode = sum(counted, "code");
const sourceAll = sourceCode + sum(counted, "comment") + sum(counted, "blank");
const testCode = sum(tests.map((file) => lines(file.text)), "code");
const testFunctions = tests.reduce((total, file) => total + (file.text.match(/#\[test\]/g) ?? []).length, 0);

const fingerprint = createHash("sha256");
for (const file of sources) fingerprint.update(`${file.path}\0${file.text}\0`);
const scopeHash = fingerprint.digest("hex");

const lib = read(join(program, "src", "lib.rs"));
const programId = /declare_id!\("([1-9A-HJ-NP-Za-km-z]{32,44})"\)/.exec(lib)?.[1];
const instructions = [...(lib.split("#[program]")[1] ?? "").matchAll(/pub fn (\w+)/g)].map((match) => match[1]);
const anchor = /anchor-lang = \{ version = "([^"]+)"/.exec(read(join(program, "Cargo.toml")))?.[1];
if (!programId || instructions.length === 0 || !anchor) {
  throw new Error(`Could not read the Hall's program ID (${programId}), instructions (${instructions.join(", ")}) or anchor-lang version (${anchor}) from ${posix(program)}; the parsing here needs updating to match it.`);
}

const number = (value) => value.toLocaleString("en-US");
const fileRows = counted.map((row) => `| \`${row.path.replace("chain/programs/hall/", "")}\` | ${number(row.code)} | ${number(row.comment)} | ${number(row.blank)} |`).join("\n");

const application = `Seametry: exchange traded funds on Solana where any wallet can be the authorized participant.

A tokenized stock is not an ordinary token: its issuer can freeze it, pause it, seize it, gate who receives it, and change how many you appear to hold. Seametry's Hall program holds a fixed basket of tokenized stocks and issues one fungible share against it. Anyone holding the constituents can Strike shares; anyone holding shares can Melt them back. The Hall reads no price and no oracle; it only moves quantities. Melt is split in two so no issuer power can block it: burning shares credits a claim on every leg without touching any constituent program, and each leg is then delivered separately, so a leg an issuer is holding back stays a visible, withdrawable claim.

Colosseum: [Colosseum project link]
Repository: https://github.com/BeyndtechArc/Seametry (public)

Program to audit: the Hall, chain/programs/hall (Anchor ${anchor}, anchor-spl with Token-2022 extensions)
Instructions: ${instructions.join(", ")}
Size: ${number(sourceCode)} lines of Rust code across ${sources.length} source files (${number(sourceAll)} including comments and blank lines). Tests are a further ${number(testCode)} lines: ${testFunctions} test functions under LiteSVM covering claim arithmetic vectors, properties, and issuer powers (freeze, pause, permanent delegate, transfer hooks, default frozen accounts, Scaled UI multiplier changes).
Scope fingerprint: sha256 ${scopeHash}, recomputed by node chain/tools/audit-scope.mjs --check

Stage: devnet. Program ${programId}, upgrade authority still held. No mainnet deployment and no TVL. Devnet Alloys use stand-in tokens that carry each real stock's Token-2022 settings. Separately, a mainnet direct-purchase path routes through Jupiter into the buyer's own wallet; it uses no Seametry program and is outside this scope.

Known change before mainnet: the first mainnet build will add a constituent mint allowlist and program-wide cumulative intake ceilings, so a canary deployment can be bounded. We would ask Vaultline to scope the audit to include that change, and will freeze the commit before work begins.

Why an audit matters now: the Hall will custody stock-linked tokens on behalf of every share holder, and once its upgrade authority is removed nobody, including us, can fix it. Its core promise is that Melt always works, under every issuer power Token-2022 allows. That promise is only as good as the code. We will not open public mainnet deposits without an independent review covering token extensions, issuer freeze and seizure, deposit and claim accounting, supply and rounding, and the authority transition.

Contact: [name, email, X or Telegram handle]`;

const document = `# Hall audit scope

Generated by \`node chain/tools/audit-scope.mjs\` from the program source; do
not edit by hand. \`--check\` fails once the program has changed since this was
written. When it does, regenerate, then edit the submitted application to match
before the audit starts. The program's guarantees and security requirements are
owned by \`docs/prd/HALL.md\`; this file only measures the code they apply to.

## Scope

- Program: \`chain/programs/hall\`, ID \`${programId}\` on devnet
- Framework: Anchor ${anchor}, anchor-spl with Token-2022 extensions
- Instructions: ${instructions.map((name) => `\`${name}\``).join(", ")}
- Source: ${number(sourceCode)} lines of code in ${sources.length} files, ${number(sourceAll)} lines in all
- Tests: ${number(testCode)} lines of code, ${testFunctions} \`#[test]\` functions, run in CI by \`cargo test --locked\`
- Fingerprint: sha256 \`${scopeHash}\` over each source file's repository path and contents, LF line endings, in path order

| File | Code | Comment | Blank |
|---|---:|---:|---:|
${fileRows}

## Known gaps before mainnet

- The canary build's constituent mint allowlist and program-wide cumulative
  intake ceilings (\`docs/prd/HALL.md\` section 5) are specified, not built.
- Trident fuzzing across instruction sequences (\`docs/prd/HALL.md\` section 5)
  is specified, not run.
- The twelve-constituent bound (\`docs/prd/HALL.md\` section 4.8) has no test:
  a legacy transaction cannot carry twelve constituents.

## Found and fixed before the audit

Seametry's own review of 18 October 2026, explained in plain words and in
code in \`docs/decisions/2026-10-18-hall-pre-audit-fixes.md\`: transfer-hook
accounts were never carried on a deposit or delivery (now carried, and tested
against a live hook); a strike against fully seized ledgers minted shares for
nothing (now refused); a dust credit restarted the vest for all pending
credit (the vest end is now size-weighted).

## Vaultline audit grant application

Submitted through Superteam Earn, Vaultline Security Audit Grants for Colosseum
Projects; applications close 31 October 2026. The bracketed fields are filled
in the form, not here, since this repository is public.

\`\`\`text
${application}
\`\`\`

Anything else:

\`\`\`text
Design spec for the Hall, including its security model and acceptance criteria: docs/prd/HALL.md
Our own mainnet readiness assessment, including the audit scope we want covered: docs/decisions/2026-10-11-index-first-mainnet-assessment.md
This scope, measured from the source: chain/AUDIT_SCOPE.md
Our own pre-audit review and its fixes: docs/decisions/2026-10-18-hall-pre-audit-fixes.md
Tests run in CI with: cargo-build-sbf --arch v0, then cargo test --locked (from chain/)
\`\`\`
`;

if (process.argv.includes("--check")) {
  let committed = "";
  try { committed = read(output); } catch { /* reported below as missing */ }
  if (committed !== document) {
    console.error(`${posix(output)} no longer matches the Hall's source (scope fingerprint now ${scopeHash}). Run node chain/tools/audit-scope.mjs, then edit the submitted audit application to match.`);
    process.exit(1);
  }
  console.log(`${posix(output)} matches the Hall's source: ${number(sourceCode)} lines of code, fingerprint ${scopeHash.slice(0, 12)}.`);
} else {
  writeFileSync(output, document);
  console.log(`Wrote ${posix(output)}: ${number(sourceCode)} lines of code in ${sources.length} files, ${testFunctions} test functions, fingerprint ${scopeHash.slice(0, 12)}.`);
}
