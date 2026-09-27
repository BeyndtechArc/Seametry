// Sentient for figures and titles, Switzer for interface, Fragment Mono for
// digests and nothing else: docs/BRAND_AND_WORLD.md section 8. The files
// come from ../../fonts, fetched by scripts/fonts.mjs, never subset or
// format converted, per the ITF Free Font License section 02.
//
// next/font/local hashes its own family name rather than registering the
// literal name a font ships with, which is deliberate on Next's part (it is
// how it avoids two different pages colliding on one name). The design
// tokens in @seametry/ui assume the opposite: --sm-font-family-display and
// its siblings name "Sentient" and "Switzer" literally, because the token
// file is shared with mobile, which has no such loader. globals.css
// reconciles the two by remapping each token variable to the loader's real
// variable, ahead of the same literal-name fallback the token already
// declares, so nothing about the token's meaning changes, only which real
// font backs it on the web.
import localFont from "next/font/local";

export const sentient = localFont({
  src: "../../fonts/Sentient-Variable.woff2",
  variable: "--font-sentient-loaded",
  display: "swap",
});

export const switzer = localFont({
  src: "../../fonts/Switzer-Variable.woff2",
  variable: "--font-switzer-loaded",
  display: "swap",
});

export const fragmentMono = localFont({
  src: "../../fonts/FragmentMono-Regular.woff2",
  variable: "--font-fragment-mono-loaded",
  display: "swap",
});
