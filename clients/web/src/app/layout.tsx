import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { themeBootScript, themeColor } from "@seametry/ui/theme-boot";
import "@seametry/ui/tokens.css";
import "./globals.css";
import { FirstTouchSignal } from "./first-touch-signal";
import { sentient, switzer, fragmentMono } from "./fonts";

// A shared link previews with the meta flyer. Crawlers need an absolute URL,
// hence metadataBase; the flyer's 1.90:1 frame is the preview ratio already.
// X caches a card's image by its URL for days and ignores Cache-Control, so a
// redrawn flyer at the same address kept showing the old one there (Storm,
// 8 October 2026). The version is the first 12 hex of the file's SHA-256;
// tests/csp.spec.ts fails when the file changes and this does not.
const FLYER_VERSION = "97d855ed81af";
const flyer = {
  url: `/Seametry%20meta%20flyer.png?v=${FLYER_VERSION}`,
  width: 3720,
  height: 1956,
  alt: "Seametry. Open-AP ETFs on Solana: baskets that keep working when issuers freeze.",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.seametry.xyz"),
  title: "Seametry",
  // The tab icon is the house mark file itself, so redrawing the logo redraws it.
  icons: { icon: { url: "/logo.svg", type: "image/svg+xml" }, apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" } },
  // iOS reads these, not the manifest, for a page saved to the home screen.
  appleWebApp: { capable: true, title: "Seametry", statusBarStyle: "default" },
  description: "Know what it's made of.",
  openGraph: { type: "website", siteName: "Seametry", title: "Seametry", description: "Open-AP ETFs on Solana: baskets that keep working when issuers freeze.", images: [flyer] },
  twitter: { card: "summary_large_image", title: "Seametry", description: "Open-AP ETFs on Solana: baskets that keep working when issuers freeze.", images: [flyer] },
};

// The browser chrome follows the mode: ThemeControl and the head script
// rewrite this meta when the page is dark.
export const viewport: Viewport = { themeColor: themeColor.light };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The CSP admits inline script only with this request's nonce (src/proxy.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      // Rendered light on the server; the head script below sets the stored,
      // system or route default before first paint, so the attribute the
      // client hydrates can differ from this one by design.
      data-theme="light"
      suppressHydrationWarning
      className={`${sentient.variable} ${switzer.variable} ${fragmentMono.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <FirstTouchSignal />
        {children}
      </body>
    </html>
  );
}
