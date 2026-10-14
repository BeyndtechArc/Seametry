/**
 * Where a client component asks for a listed mint's logo, without the logo
 * manifest in its bundle. The route redirects to the mirrored file, or
 * answers 204 with nothing, which the lot mark draws as the lettered tile.
 */
export function logoSrc(mintOrSymbol: string): string {
  return `/instruments/logo/${encodeURIComponent(mintOrSymbol)}`;
}
