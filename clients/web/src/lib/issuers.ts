// Its own module because client components use it, and the modules that
// hold issuer data (admissions.ts) import the whole admissions snapshot,
// which no browser should download to shorten a name.

/** "Backed Finance (xStocks)" reads as xStocks, "Backpack Securities" as Backpack: the name a buyer knows the product by. */
export function shortIssuer(name: string): string {
  return /\(([^)]+)\)/.exec(name)?.[1] ?? name.split(" ")[0];
}
