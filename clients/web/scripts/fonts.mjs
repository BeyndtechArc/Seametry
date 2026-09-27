#!/usr/bin/env node
// Fetches Sentient and Switzer from Fontshare, and Fragment Mono from Google
// Fonts, into clients/web/fonts. Ported from server/cmd/fonts, which this
// replaces: the app now builds without Go, and this is the only font fetcher
// in the repository.
//
// The font files are deliberately not committed. The ITF Free Font License
// permits self-hosting for our own sites and applications, and explicitly
// recommends it, but it forbids redistributing the font software "through
// another font website, font library, marketplace, repository, download
// service" or "publicly accessible servers". This repository is public, so
// committing the binaries would be redistribution. Anyone who needs them runs
// this and obtains their own copy directly from Fontshare, which is what the
// licence requires of them anyway.
//
// Subsetting and format conversion are also forbidden, so the variable WOFF2
// ships whole, and this script never touches the bytes it downloads.
//
// Usage: node clients/web/scripts/fonts.mjs

import AdmZip from 'adm-zip';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');

const FONTSHARE_DOWNLOAD = 'https://api.fontshare.com/v2/fonts/download/';

// want maps a suffix inside the archive to the name written locally. Web gets
// the variable WOFF2; mobile embedding gets the variable TTF.
const families = [
  {
    slug: 'sentient',
    want: {
      '/WEB/fonts/Sentient-Variable.woff2': 'Sentient-Variable.woff2',
      '/TTF/Sentient-Variable.ttf': 'Sentient-Variable.ttf',
      '/License/FFL.txt': 'FONTSHARE-FFL.txt',
    },
  },
  {
    slug: 'switzer',
    want: {
      '/WEB/fonts/Switzer-Variable.woff2': 'Switzer-Variable.woff2',
      '/TTF/Switzer-Variable.ttf': 'Switzer-Variable.ttf',
    },
  },
];

// Fragment Mono is the digest face: hashes, addresses, signatures, and
// nothing else. It comes from Google Fonts under the SIL Open Font License,
// which does permit redistribution, unlike the Fontshare pair. It is still
// fetched rather than committed, so that one command produces the whole set.
const FRAGMENT_MONO_CSS = 'https://fonts.googleapis.com/css2?family=Fragment+Mono&display=swap';
// Google serves WOFF2 only to a user agent it believes supports it.
const MODERN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchFamily(family) {
  console.log(`fetching ${family.slug}`);
  const response = await fetch(FONTSHARE_DOWNLOAD + family.slug);
  if (!response.ok) fail(`${family.slug}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());

  const archive = new AdmZip(body);
  const found = new Set();
  let total = 0;
  for (const entry of archive.getEntries()) {
    for (const [suffix, local] of Object.entries(family.want)) {
      if (!entry.entryName.endsWith(suffix)) continue;
      const content = entry.getData();
      await writeFile(join(dir, local), content);
      console.log(`  ${local.padEnd(28)} ${String(content.length).padStart(7)} bytes`);
      found.add(suffix);
      total += content.length;
    }
  }
  for (const suffix of Object.keys(family.want)) {
    if (!found.has(suffix)) {
      fail(`${family.slug}: the archive no longer contains ${suffix}; Fontshare may have changed its layout`);
    }
  }
  return total;
}

// fetchFragmentMono resolves the current WOFF2 from the Google Fonts
// stylesheet rather than hardcoding a versioned URL, because those URLs
// change whenever the font is revised and a stale one fails silently by
// falling back.
async function fetchFragmentMono() {
  console.log('fetching fragment-mono');
  const cssResponse = await fetch(FRAGMENT_MONO_CSS, { headers: { 'User-Agent': MODERN_UA } });
  const stylesheet = await cssResponse.text();

  // Google emits one @font-face per unicode subset, latin last.
  const matches = [...stylesheet.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)];
  if (matches.length === 0) {
    fail('fragment-mono: the stylesheet offered no woff2; Google may have changed what it serves');
  }
  const url = matches[matches.length - 1][1];

  const fontResponse = await fetch(url, { headers: { 'User-Agent': MODERN_UA } });
  const body = Buffer.from(await fontResponse.arrayBuffer());
  await writeFile(join(dir, 'FragmentMono-Regular.woff2'), body);
  console.log(`  ${'FragmentMono-Regular.woff2'.padEnd(28)} ${String(body.length).padStart(7)} bytes`);
  return body.length;
}

function fail(message) {
  console.error(`fonts: ${message}`);
  process.exit(1);
}

async function main() {
  await mkdir(dir, { recursive: true });
  let total = 0;
  for (const family of families) {
    total += await fetchFamily(family);
  }
  total += await fetchFragmentMono();
  console.log(`\n${total} bytes written to ${dir}`);
  console.log('These files are gitignored on purpose. See clients/web/fonts/README.md.');
}

main().catch((err) => fail(err.stack || String(err)));
