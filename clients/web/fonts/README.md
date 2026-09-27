# Fonts

Sentient for figures and titles, Switzer for interface, per
`docs/BRAND_AND_WORLD.md` section 8. Both from
[Fontshare](https://www.fontshare.com), under the ITF Free Font License.
Fragment Mono, the digest face, comes from Google Fonts under the SIL Open
Font License.

```bash
npm run fonts --workspace=clients/web
```

That writes `Sentient-Variable.woff2`, `Switzer-Variable.woff2`,
`FragmentMono-Regular.woff2`, the matching variable TTFs for future mobile
embedding, and the licence text. It also runs automatically before `npm run
build` (the `prebuild` script), so a fresh checkout builds without a separate
step.

## The font files are not committed, deliberately

The licence permits self-hosting and recommends it, and permits embedding in
mobile and desktop applications, commercially, free, with no attribution
required. What it forbids is redistribution: the font software may not be made
available to others "through another font website, font library, marketplace,
repository, download service" or through "publicly accessible servers".

This repository is public. Committing the binaries would be redistribution, so
`.gitignore` excludes them and `scripts/fonts.mjs` fetches them instead. Anyone
who needs them obtains their own copy directly from Fontshare, which is what
the licence requires of them regardless.

Serving the fonts from our own site to visitors is a different thing and is
explicitly allowed: section 02 carves out "self-hosting, embedding or other use
of the Font Software by the Licensee for the Licensee's own websites,
applications or other permitted uses".

## No subsetting

The licence classes subsetting and format conversion as creating a derivative
work and forbids both without written consent. So the usual webfont pipeline,
subset to the glyphs a page uses, is not available here, and `next/font/local`
(`src/app/fonts.ts`) is given the official WOFF2 files exactly as downloaded.
Compared before shipping: a font built by `next build` under `.next/` hashes
identically to the file this script wrote.

It costs less than it sounds. The variable WOFF2 files are 50KB and 43KB, 94KB
for both faces across every weight and optical size, which is smaller than a
subsetted static family at four weights would typically be. Loaded with
`display: "swap"`.

## Why variable rather than static weights

One file per family covers every weight, so a design can use 300 for a display
figure and 600 for a serial without a second network request. It also means no
synthetic bolding, which is what a browser does when a weight is missing and is
visible on a serial rendered in tabular figures.
